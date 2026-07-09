/**
 * debugSphereRenderer — UV-sphere mesh drawn into the foreground depth pass.
 *
 * This renderer exists to eyeball correctness at Earth scale: roundness,
 * jitter, and pole orientation are all legible through the lat-long grid
 * in `debugSphere/fragment.wesl` even before a real texture is applied.
 * It complements the Earth renderer (Plan 02) as a visual diagnostic that
 * can be toggled without rebuilding the full planet pipeline.
 *
 * ### Geometry
 *
 * A UV sphere (48 segments × 24 rings) built CPU-side by `uvSphereMesh`
 * and uploaded once as a position VBO (tightly-packed f32x3, stride 12)
 * plus a Uint16 IBO. The index count is captured at creation; the `uvs`
 * array is not uploaded — the debug shaders do not texture the sphere.
 *
 * ### Shared library
 *
 * `lib/sphere.wesl` defines `SphereUniforms` (one mat4x4<f32>, 64 bytes)
 * and `clip_from_local`. `debugSphere/vertex.wesl` declares the binding
 * at `@group(0) @binding(0)` and imports the struct + helper. To draw
 * several spheres in one frame the CPU side packs each body's 64-byte MVP
 * into its own 256-byte slot of a dynamic-offset uniform buffer, then draws
 * each with the matching bind-group offset — so every sphere keeps its own
 * matrix through to submit.
 *
 * ### Pipeline state
 *
 * Color target: whatever `targetFormat` the caller passes (typically
 * `rgba16float` for the HDR foreground render target). Depth: the caller's
 * `depthFormat` (typically `depth32float`), with `depthWriteEnabled: true`
 * and `depthCompare: 'less'` so the sphere correctly occludes / is occluded
 * by other foreground geometry. Cull mode: `'back'` with `frontFace:
 * 'ccw'` — `uvSphereMesh` winds every triangle CCW when viewed from
 * outside, so the GPU default (CCW = front) correctly culls inward-facing
 * back faces.
 *
 * ### Bind group layout
 *
 * An explicit `bindGroupLayout` (not `layout: 'auto'`) is used so the
 * layout object can be reused across pipelines without being tied to a
 * specific pipeline's auto-derived layout. This follows the project
 * convention from `pointRenderer.ts` and avoids the auto-layout trap
 * documented in `feedback_webgpu_auto_layout_trap.md`.
 *
 * @module
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { DebugSphereRenderer } from '../../../@types/rendering/DebugSphereRenderer';
import { uvSphereMesh } from '../../../utils/math/uvSphereMesh';
import vsCode from '../shaders/debugSphere/vertex.wesl?static';
import fsCode from '../shaders/debugSphere/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/** UV-sphere tessellation counts — 48 segments × 24 rings gives smooth
 *  silhouettes at close range without overwhelming the vertex throughput. */
const SEGMENTS = 48;
const RINGS = 24;

/** `SphereUniforms` contains one mat4x4<f32> — 16 floats × 4 bytes. */
const UNIFORM_BUFFER_SIZE = 64;

/** Per-sphere stride in the dynamic-offset uniform buffer. WebGPU requires
 *  dynamic offsets to be a multiple of `minUniformBufferOffsetAlignment`,
 *  whose maximum across our target devices is 256 — so each sphere's 64-byte
 *  MVP gets its own 256-byte slot. */
const UNIFORM_SLOT_SIZE = 256;

/** Upper bound on spheres drawn per frame. The debug overlay only ever shows
 *  a handful of bodies (Sun, Earth, …); this caps the uniform buffer size. */
const MAX_SPHERES = 8;

export function createDebugSphereRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
): DebugSphereRenderer {
  // ── Geometry upload ───────────────────────────────────────────────────────
  //
  // Only the positions array is uploaded — the debug shaders derive the
  // surface normal from the local-space position (unit sphere: normal == pos)
  // and do not sample a texture, so `uvs` goes unused.
  const mesh = uvSphereMesh(SEGMENTS, RINGS);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'debugSphere-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const indexBuffer = device.createBuffer({
    label: 'debugSphere-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  // ── Uniform buffer (dynamic-offset, one slot per sphere) ──────────────────
  //
  // Holds up to MAX_SPHERES `SphereUniforms { mvp: mat4x4<f32> }` blocks, one
  // per 256-byte slot. Each sphere's MVP is written to its OWN slot before any
  // draw, and selected at draw time by a dynamic bind-group offset — so every
  // sphere renders with its own matrix in a single submit. Writing one shared
  // 64-byte uniform per draw would NOT work: queue.writeBuffer is ordered
  // against submit, not against the draws between writes, so all draws would
  // read the last-written MVP and every sphere would collapse onto the final
  // body (the same class of bug as the per-draw-uniform mutation noted in the
  // renderer guidance — bake per-draw data so it survives to submit).
  const uniformBuffer = device.createBuffer({
    label: 'debugSphere-uniform-buffer',
    size: MAX_SPHERES * UNIFORM_SLOT_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  //
  // Group 0, binding 0: the SphereUniforms block, visible in the vertex
  // stage only (the fragment shader derives everything from the interpolated
  // localPos passed by the vertex stage). `hasDynamicOffset` lets one bind
  // group address any sphere's slot via a per-draw offset.
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'debugSphere-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform', hasDynamicOffset: true },
      },
    ],
  });

  // `size: UNIFORM_BUFFER_SIZE` binds just the 64-byte SphereUniforms window
  // that starts at the dynamic offset, not the whole multi-slot buffer.
  const bindGroup = device.createBindGroup({
    label: 'debugSphere-bg',
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer, offset: 0, size: UNIFORM_BUFFER_SIZE } },
    ],
  });

  // ── Shader modules ────────────────────────────────────────────────────────
  //
  // `createShaderModuleWithDevLog` prints the linked WGSL + getCompilationInfo
  // errors in dev mode so WESL-import failures are diagnosable without
  // digging through the browser's generic "createShaderModule failed" message.
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'debugSphere.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'debugSphere.fragment');

  // ── Render pipeline ───────────────────────────────────────────────────────
  //
  // Vertex layout: tightly-packed f32x3 positions (stride 12, @location(0)).
  // Front face: CCW (WebGPU default, matching uvSphereMesh's outward winding).
  // Cull mode: 'back' — with CCW front-face, back-face triangles (inner
  //   surface) are correctly discarded.
  // Blend: none (opaque replace) — the fragment emits alpha=1; the foreground
  //   composite handles blending the entire foreground layer into the HDR
  //   buffer, not individual foreground draws.
  // Depth: write-enabled + less-than test so the sphere participates in the
  //   same foreground depth sort as other opaque foreground geometry.
  const pipeline = device.createRenderPipeline({
    label: 'debugSphere-pipeline',
    layout: device.createPipelineLayout({
      label: 'debugSphere-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 12, // 3 × f32
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
          // No blend descriptor = opaque replace.  The fragment already
          // emits alpha=1; no premultiplied or straight-alpha blending
          // is needed for an opaque foreground draw.
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

  function draw(pass: GPURenderPassEncoder, mvps: readonly Float32Array[]): void {
    const count = Math.min(mvps.length, MAX_SPHERES);
    if (count === 0) return;

    // Write every MVP to its own 256-byte slot FIRST (distinct byte ranges, so
    // no write clobbers another), then issue the draws — each selecting its
    // slot via a dynamic offset. All slots are populated before the single
    // submit, so each sphere renders with its own matrix.
    for (let i = 0; i < count; i++) {
      const mvp = mvps[i];
      if (mvp) device.queue.writeBuffer(uniformBuffer, i * UNIFORM_SLOT_SIZE, mvp);
    }

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    for (let i = 0; i < count; i++) {
      pass.setBindGroup(0, bindGroup, [i * UNIFORM_SLOT_SIZE]);
      pass.drawIndexed(indexCount);
    }
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    positionBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
  }

  const renderer: DebugSphereRenderer = {
    label: 'debugSphereRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
