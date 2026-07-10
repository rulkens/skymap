/**
 * planetRenderer — flat-lit albedo planet drawn into the opaque near-field
 * foreground target.
 *
 * Structural twin of `starRenderer` (same `uvSphereMesh` geometry, same
 * 80-byte `TintedSphereUniforms` block, same opaque depth-tested pipeline
 * profile against the caller's foreground `targetFormat` / `depthFormat`);
 * the difference is entirely in the shader pair. The planet's vertex stage
 * forwards the unit-sphere local position (== outward normal) and the
 * fragment modulates the uniform albedo by ONE lambert dot product against
 * a fixed light direction plus a small ambient floor — see
 * `planet/fragment.wesl` for why the fixed direction is a documented
 * stand-in for real sun-relative lighting, not a lighting system.
 *
 * No texture machinery: a uniform albedo is enough at the descent's
 * fly-past distances. If a body ever earns imagery it would grow the
 * Earth's placeholder-texture + `setTexture` pattern; starting textureless
 * keeps this renderer at exactly the surface the plan's contract names.
 *
 * **Precondition — one draw per renderer instance per frame:** `draw`
 * writes MVP+albedo into a single non-dynamic uniform buffer, so two
 * same-frame draws (e.g. two planets through one instance) would race
 * `queue.writeBuffer` against the pending submit — same caveat as
 * `earthRenderer`. The wiring gives each drawn body its own instance (or a
 * future dynamic-offset upgrade).
 *
 * @module
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { PlanetRenderer } from '../../../@types/rendering/PlanetRenderer';
import type { Vec3 } from '../../../@types/math/Vec3';
import { uvSphereMesh } from '../../../utils/math/uvSphereMesh';
import vsCode from '../shaders/planet/vertex.wesl?static';
import fsCode from '../shaders/planet/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/** UV-sphere tessellation counts — matches `earthRenderer` /
 *  `starRenderer` so every sphere body shares a mesh shape. */
const SEGMENTS = 48;
const RINGS = 24;

/**
 * `TintedSphereUniforms` byte size: mat4x4<f32> (64) + vec3<f32> (12) +
 * trailing pad (4) = 80 — a WGSL struct's size rounds up to its 16-byte
 * alignment.  See `lib/sphere.wesl` for the authoritative layout.
 */
const UNIFORM_BUFFER_SIZE = 80;

export function createPlanetRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
): PlanetRenderer {
  // ── Geometry upload (positions + indices; the lambert term needs no uvs) ──
  const mesh = uvSphereMesh(SEGMENTS, RINGS);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'planet-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const indexBuffer = device.createBuffer({
    label: 'planet-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  // ── Uniform buffer + CPU scratch ──────────────────────────────────────────
  //
  // One 80-byte `TintedSphereUniforms` block, rebuilt in `uniformScratch`
  // each draw: floats 0..15 = mvp, 16..18 = albedo, 19 = pad (stays 0).
  const uniformBuffer = device.createBuffer({
    label: 'planet-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new Float32Array(UNIFORM_BUFFER_SIZE / 4);

  // ── Bind group (explicit layout, not 'auto') ──────────────────────────────
  //
  // Binding 0 is visible to BOTH stages: the vertex stage reads `mvp`, the
  // fragment stage reads `tint` (the albedo) from the same block.
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'planet-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const bindGroup = device.createBindGroup({
    label: 'planet-bg',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  // ── Shader modules ────────────────────────────────────────────────────────
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'planet.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'planet.fragment');

  // ── Render pipeline (opaque foreground profile, same as earthRenderer) ────
  const pipeline = device.createRenderPipeline({
    label: 'planet-pipeline',
    layout: device.createPipelineLayout({
      label: 'planet-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 12, // 3 × f32 position
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // No blend descriptor = opaque replace; the fragment emits alpha=1
          // and the foreground composite blends the whole layer.
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // CCW = outward-facing (matches uvSphereMesh winding)
      cullMode: 'back', // discard inward-facing (inner-surface) triangles
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, mvp: Float32Array, albedo: Vec3): void {
    uniformScratch.set(mvp, 0);
    uniformScratch[16] = albedo[0];
    uniformScratch[17] = albedo[1];
    uniformScratch[18] = albedo[2];
    // uniformScratch[19] is the struct-trailing pad — left at 0.
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    positionBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
  }

  const renderer: PlanetRenderer = {
    label: 'planetRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
