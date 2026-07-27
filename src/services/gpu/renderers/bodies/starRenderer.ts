/**
 * starRenderer — resolved (sphere-filling) star drawn flat-emissive into the
 * opaque near-field foreground target.
 *
 * Same skeleton as `earthRenderer`: the shared `uvSphereMesh` geometry, an
 * explicit bind-group layout, an opaque depth-tested pipeline profile
 * (depth write + reversed-Z 'greater' — the NEAR0 slab clears `0.0`, greater-z-wins
 * — CCW front face, back-face cull, no blend) against
 * the caller's foreground `targetFormat` / `depthFormat`. Two deltas:
 *
 *   1. No texture machinery — a star is flat emissive, so there is no
 *      sampler, no placeholder texture and no `setTexture`; the fragment
 *      reads one uniform colour.
 *   2. The uniform block is `TintedSphereUniforms` (80 bytes: mat4x4<f32>
 *      MVP + vec3<f32> tint + trailing pad — see `lib/sphere.wesl` for the
 *      authoritative layout), not the bare 64-byte `SphereUniforms`,
 *      because the spectral colour rides alongside the MVP. `draw` writes
 *      the whole 80-byte block in one `writeBuffer`.
 *
 * The geometry uploads positions + indices only — `uvSphereMesh` also
 * emits uvs, but a flat emissive fragment samples nothing, so binding a uv
 * VBO would declare a vertex stream no shader reads (same trimming the
 * planet renderer does).
 *
 * **Precondition — draw at most once per frame:** `draw` writes the
 * MVP+colour into a single non-dynamic uniform buffer before issuing the
 * indexed draw, so a second same-frame `draw` would race
 * `queue.writeBuffer` against the pending `queue.submit` — the same
 * caveat documented on `earthRenderer`.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { StarRenderer } from '../../../../@types/rendering/StarRenderer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import {
  BODY_SPHERE_RINGS,
  BODY_SPHERE_SEGMENTS,
} from '../../../../data/bodies/sphereTessellation';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import vsCode from '../../shaders/bodies/star/vertex.wesl?static';
import fsCode from '../../shaders/bodies/star/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

/**
 * `TintedSphereUniforms` byte size: mat4x4<f32> (64) + vec3<f32> (12) +
 * trailing pad (4) = 80.  The pad exists because a WGSL struct's size
 * rounds up to its 16-byte alignment; the CPU mirrors it with one zeroed
 * float so the `writeBuffer` length matches the GPU-side size exactly.
 */
const UNIFORM_BUFFER_SIZE = 80;

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
  // each draw: floats 0..15 = mvp, 16..18 = colour, 19 = pad (stays 0).
  const uniformBuffer = device.createBuffer({
    label: 'star-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new Float32Array(UNIFORM_BUFFER_SIZE / 4);

  // ── Bind group (explicit layout, not 'auto') ──────────────────────────────
  //
  // Binding 0 is visible to BOTH stages: the vertex stage reads `mvp`, the
  // fragment stage reads `tint` from the same `TintedSphereUniforms` block.
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

  // ── Render pipeline (opaque foreground profile, same as earthRenderer) ────
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
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3): void {
    uniformScratch.set(mvp, 0);
    uniformScratch[16] = color[0];
    uniformScratch[17] = color[1];
    uniformScratch[18] = color[2];
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

  const renderer: StarRenderer = {
    label: 'starRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
