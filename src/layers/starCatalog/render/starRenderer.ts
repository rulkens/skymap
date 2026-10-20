/**
 * starRenderer — resolved (sphere-filling) star drawn flat-emissive into the
 * near-field foreground target.
 *
 * Same skeleton as `earthRenderer`: the shared `uvSphereMesh` geometry, an
 * explicit bind-group layout, a depth-tested pipeline profile (depth write +
 * reversed-Z 'greater' — the NEAR0 slab clears `0.0`, greater-z-wins — CCW
 * front face, back-face cull) against the caller's foreground `targetFormat` /
 * `depthFormat`, blending straight-alpha OVER so a sphere can fade with its
 * catalog. At opacity 1 OVER is the opaque replace (`src·1 + dst·0`) while the
 * destination is finite. Two deltas:
 *
 *   1. No texture machinery — a star is flat emissive, so there is no
 *      sampler, no placeholder texture and no `setTexture`; the fragment
 *      reads one uniform colour.
 *   2. The uniform block is `TintedSphereUniforms` (80 bytes: mat4x4<f32>
 *      MVP + vec3<f32> tint + f32 opacity — see `lib/sphere.wesl` for the
 *      authoritative layout), not the bare 64-byte `SphereUniforms`,
 *      because the spectral colour and opacity ride alongside the MVP. `draw`
 *      writes the whole 80-byte block in one `writeBuffer`.
 *
 * The geometry uploads positions + indices only — `uvSphereMesh` also
 * emits uvs, but a flat emissive fragment samples nothing, so binding a uv
 * VBO would declare a vertex stream no shader reads (same trimming the
 * planet renderer does).
 *
 * **Precondition — draw at most once per frame:** `draw` writes the
 * MVP, colour and opacity into a single non-dynamic uniform buffer before issuing the
 * indexed draw, so a second same-frame `draw` would race
 * `queue.writeBuffer` against the pending `queue.submit` — the same
 * caveat documented on `earthRenderer`.
 *
 * @module
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { StarRenderer } from '../@types/StarRenderer';
import type { Vec3 } from '../../../@types/math/Vec3';
import { uvSphereMesh } from '../../../utils/math/uvSphereMesh';
import { BODY_SPHERE_RINGS, BODY_SPHERE_SEGMENTS } from '../../../data/bodies/sphereTessellation';
import { resolveDepthCompare } from '../../../utils/gpu/resolveDepthCompare';
import vsCode from '../../../services/gpu/shaders/bodies/star/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/bodies/star/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';

/**
 * `TintedSphereUniforms` byte size: mat4x4<f32> (64) + vec3<f32> (12) +
 * f32 opacity (4) = 80. The opacity fills what was the struct's trailing
 * pad, so the size iOS validates the binding against is unchanged.
 */
const UNIFORM_BUFFER_SIZE = 80;
/** Float index of `opacity` in the block: byte 76. */
const OPACITY_FLOAT = 19;

/**
 * @param reversedZ selects this slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
 *   `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`.
 */
export function createStarRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): StarRenderer {
  // ── Geometry upload (positions + indices; no uvs — see module header) ────
  const mesh = uvSphereMesh(BODY_SPHERE_SEGMENTS, BODY_SPHERE_RINGS);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'star-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const indexBuffer = device.createBuffer({
    label: 'star-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  // ── Uniform buffer + CPU scratch ──────────────────────────────────────────
  //
  // One 80-byte `TintedSphereUniforms` block, rebuilt in `uniformScratch`
  // each draw: floats 0..15 = mvp, 16..18 = colour, 19 = opacity.
  const uniformBuffer = device.createBuffer({
    label: 'star-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new Float32Array(UNIFORM_BUFFER_SIZE / 4);

  // ── Bind group (explicit layout, not 'auto') ──────────────────────────────
  //
  // Binding 0 is visible to BOTH stages: the vertex stage reads `mvp`, the
  // fragment stage reads `tint` and `opacity` from the same block.
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'star-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const bindGroup = device.createBindGroup({
    label: 'star-bg',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  // ── Shader modules ────────────────────────────────────────────────────────
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'star.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'star.fragment');

  // ── Render pipeline (earthRenderer's depth profile, OVER-blended) ─────────
  const pipeline = device.createRenderPipeline({
    label: 'star-pipeline',
    layout: device.createPipelineLayout({
      label: 'star-pipeline-layout',
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
          // Straight-alpha OVER, the factors `cloudShellRenderer` uses.
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
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
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3, opacity: number): void {
    uniformScratch.set(mvp, 0);
    uniformScratch[16] = color[0];
    uniformScratch[17] = color[1];
    uniformScratch[18] = color[2];
    uniformScratch[OPACITY_FLOAT] = opacity;
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

  const renderer: StarRenderer = {
    label: 'starRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
