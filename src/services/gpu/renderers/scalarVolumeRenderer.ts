/**
 * ScalarVolumeRenderer — multi-field, palette-driven, additive 3D
 * scalar-field volume renderer.  See the spec at
 * 'docs/superpowers/specs/2026-05-09-scalar-volume-renderer-design.md'.
 *
 * Public surface (factory shape, matching D.2 conventions):
 *
 *   - createScalarVolumeRenderer(device, format)
 *   - addField(handle, cube)        → upload cube to a 3D r16float
 *                                       texture, register in the field map
 *   - removeField(handle)            → drop the texture, unregister
 *   - setEnabled(handle, enabled)    → per-field draw gate
 *   - setIntensity(handle, intensity) → [0, 1]
 *   - hasActiveFields()              → true iff any registered+enabled
 *                                       field has intensity > 0; used by
 *                                       the renderer's pass to early-out
 *   - draw(pass, camera)             → dispatch one raymarch per active
 *                                       field, additively blended
 *   - destroy()                      → release all GPU resources
 *
 * Per-field state lives in a 'Map<handle, FieldEntry>'; each entry owns
 * its own 3D texture, palette LUT texture, bind group, uniform buffer,
 * and runtime tunables (enabled, intensity, model matrix).  Sharing the
 * pipeline across all fields keeps the layout-'auto' trap from biting:
 * one pipeline → one auto-derived bind-group layout → all bind groups
 * are interchangeable across fields with the same shape.
 */

import { mat4 } from 'gl-matrix';
import type { ScalarCube, ScalarFieldFrameKind } from '../../../@types/ScalarCube';
import { buildPaletteLut, PALETTE_LUT_SIZE } from '../../../data/scalarFieldPalettes';
import vsCode from '../shaders/scalarVolume/vertex.wesl?static';
import fsCode from '../shaders/scalarVolume/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// 80 (cam) + 64 (model) + 64 (invModel) + 12 (camPos) + 4 (intensity) = 224
const UNIFORM_BYTES = 224;

const CUBE_CORNERS = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
  1, 1, 0,
  0, 0, 1,
  1, 0, 1,
  0, 1, 1,
  1, 1, 1,
]);

const CUBE_INDICES = new Uint16Array([
  // -z face (winding so normal points -z)
  0, 2, 1,  1, 2, 3,
  // +z face
  4, 5, 6,  5, 7, 6,
  // -y face
  0, 1, 4,  1, 5, 4,
  // +y face
  2, 6, 3,  3, 6, 7,
  // -x face
  0, 4, 2,  2, 4, 6,
  // +x face
  1, 3, 5,  3, 7, 5,
]);

// Supergalactic→equatorial rotation, J2000.  Standard astronomy
// constant — see e.g. de Vaucouleurs 1976.  Stored as a 3x3 column-
// major matrix because it's only ever multiplied with another mat4.
const SG_TO_EQ_ROT = mat4.fromValues(
  -0.7357425, -0.0745682,  0.6731453, 0,
   0.6772612, -0.0808998,  0.7312238, 0,
   0.0000000,  0.9938837,  0.1100143, 0,
   0,          0,          0,         1,
);

const FRAME_TO_WORLD: Record<ScalarFieldFrameKind, mat4> = {
  'supergalactic-cartesian': SG_TO_EQ_ROT,
  'equatorial-cartesian': mat4.create(),
  galactic: mat4.create(),
};

// ── Pure helper: model matrix builder ───────────────────────────────
//
// Maps the unit cube '[0,1]^3' (vertex shader's input space) to the
// cube's footprint in skymap world space.  Composition order, applied
// right-to-left to a unit-cube corner:
//
//   1. scale by (Nx*voxelSize, Ny*voxelSize, Nz*voxelSize) → physical extent
//   2. rotate by the cube's per-cube quaternion (in its native frame)
//   3. translate by the cube's origin (in its native frame)
//   4. transform from the native frame into world space
//
// The function is exported (rather than locked inside the factory)
// because steps 1-3 are pure math worth unit-testing without standing
// up a GPU device.
export function buildCubeModelMatrix(cube: ScalarCube): mat4 {
  const out = mat4.create();
  mat4.copy(out, FRAME_TO_WORLD[cube.frameKind]);
  mat4.translate(out, out, [cube.origin[0], cube.origin[1], cube.origin[2]]);
  const rotMat = mat4.create();
  mat4.fromQuat(rotMat, [cube.rotation[0], cube.rotation[1], cube.rotation[2], cube.rotation[3]]);
  mat4.multiply(out, out, rotMat);
  const sx = cube.dims[0] * cube.voxelSize;
  const sy = cube.dims[1] * cube.voxelSize;
  const sz = cube.dims[2] * cube.voxelSize;
  mat4.scale(out, out, [sx, sy, sz]);
  return out;
}

// ── Factory ─────────────────────────────────────────────────────────

export type ScalarFieldHandle = string;

type FieldEntry = {
  handle: ScalarFieldHandle;
  enabled: boolean;
  intensity: number;
  modelMatrix: mat4;
  invModelMatrix: mat4;
  volumeTexture: GPUTexture;
  paletteTexture: GPUTexture;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
};

export type ScalarVolumeRenderer = {
  addField(handle: ScalarFieldHandle, cube: ScalarCube): void;
  removeField(handle: ScalarFieldHandle): void;
  setEnabled(handle: ScalarFieldHandle, enabled: boolean): void;
  setIntensity(handle: ScalarFieldHandle, intensity: number): void;
  hasActiveFields(): boolean;
  listHandles(): ScalarFieldHandle[];
  draw(pass: GPURenderPassEncoder, viewProj: mat4, viewportPx: [number, number], cameraPosWorld: [number, number, number]): void;
  destroy(): void;
};

export function createScalarVolumeRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
): ScalarVolumeRenderer {
  const cornerBuffer = device.createBuffer({
    size: CUBE_CORNERS.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cornerBuffer, 0, CUBE_CORNERS);

  const indexBuffer = device.createBuffer({
    size: CUBE_INDICES.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, CUBE_INDICES);

  const volumeSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });
  const paletteSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'scalarVolume.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'scalarVolume.fragment');

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: vsModule,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'front', // ← back faces only; see fragment.wesl module header
    },
  });
  const bindGroupLayout = pipeline.getBindGroupLayout(0);

  const fields = new Map<ScalarFieldHandle, FieldEntry>();

  function uploadCube(cube: ScalarCube): GPUTexture {
    const tex = device.createTexture({
      size: { width: cube.dims[0], height: cube.dims[1], depthOrArrayLayers: cube.dims[2] },
      format: 'r16float',
      dimension: '3d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: tex },
      cube.voxels,
      { bytesPerRow: cube.dims[0] * 2, rowsPerImage: cube.dims[1] },
      { width: cube.dims[0], height: cube.dims[1], depthOrArrayLayers: cube.dims[2] },
    );
    return tex;
  }

  function uploadPalette(cube: ScalarCube): GPUTexture {
    const lut = buildPaletteLut(cube.paletteId);
    const tex = device.createTexture({
      size: { width: PALETTE_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      dimension: '1d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: tex },
      lut,
      { bytesPerRow: PALETTE_LUT_SIZE * 4 },
      { width: PALETTE_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
    );
    return tex;
  }

  return {
    addField(handle, cube) {
      const existing = fields.get(handle);
      if (existing) {
        existing.volumeTexture.destroy();
        existing.paletteTexture.destroy();
        existing.uniformBuffer.destroy();
        fields.delete(handle);
      }
      const modelMatrix = buildCubeModelMatrix(cube);
      const invModelMatrix = mat4.create();
      mat4.invert(invModelMatrix, modelMatrix);
      const volumeTexture = uploadCube(cube);
      const paletteTexture = uploadPalette(cube);
      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: volumeTexture.createView() },
          { binding: 2, resource: volumeSampler },
          { binding: 3, resource: paletteTexture.createView() },
          { binding: 4, resource: paletteSampler },
        ],
      });
      fields.set(handle, {
        handle,
        enabled: true,
        intensity: 0.5,
        modelMatrix,
        invModelMatrix,
        volumeTexture,
        paletteTexture,
        uniformBuffer,
        bindGroup,
      });
    },
    removeField(handle) {
      const entry = fields.get(handle);
      if (!entry) return;
      entry.volumeTexture.destroy();
      entry.paletteTexture.destroy();
      entry.uniformBuffer.destroy();
      fields.delete(handle);
    },
    setEnabled(handle, enabled) {
      const entry = fields.get(handle);
      if (entry) entry.enabled = enabled;
    },
    setIntensity(handle, intensity) {
      const entry = fields.get(handle);
      if (entry) entry.intensity = Math.max(0, Math.min(1, intensity));
    },
    hasActiveFields() {
      for (const e of fields.values()) {
        if (e.enabled && e.intensity > 0) return true;
      }
      return false;
    },
    listHandles() {
      return Array.from(fields.keys());
    },
    draw(pass, viewProj, viewportPx, cameraPosWorld) {
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, cornerBuffer);
      pass.setIndexBuffer(indexBuffer, 'uint16');
      // Per-field uniform buffer layout:
      //   0..63   viewProj        (mat4x4 column-major, 16 floats)
      //  64..71   viewportPx      (vec2)
      //  72..79   _pad0, _pad1
      //  80..143  modelMatrix     (mat4x4)
      // 144..207  invModelMatrix  (mat4x4)
      // 208..219  cameraPosWorld  (vec3)
      // 220..223  intensity       (f32)
      const scratch = new Float32Array(UNIFORM_BYTES / 4);
      for (const e of fields.values()) {
        if (!e.enabled || e.intensity <= 0) continue;
        for (let i = 0; i < 16; i++) scratch[i] = viewProj[i] ?? 0;
        scratch[16] = viewportPx[0];
        scratch[17] = viewportPx[1];
        scratch[18] = 0;
        scratch[19] = 0;
        for (let i = 0; i < 16; i++) scratch[20 + i] = e.modelMatrix[i] ?? 0;
        for (let i = 0; i < 16; i++) scratch[36 + i] = e.invModelMatrix[i] ?? 0;
        scratch[52] = cameraPosWorld[0];
        scratch[53] = cameraPosWorld[1];
        scratch[54] = cameraPosWorld[2];
        scratch[55] = e.intensity;
        device.queue.writeBuffer(e.uniformBuffer, 0, scratch);
        pass.setBindGroup(0, e.bindGroup);
        pass.drawIndexed(CUBE_INDICES.length);
      }
    },
    destroy() {
      for (const e of fields.values()) {
        e.volumeTexture.destroy();
        e.paletteTexture.destroy();
        e.uniformBuffer.destroy();
      }
      fields.clear();
      cornerBuffer.destroy();
      indexBuffer.destroy();
    },
  };
}
