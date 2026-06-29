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
 * at `@group(0) @binding(0)` and imports the struct + helper. The CPU
 * side writes 64 bytes of column-major float32 per draw via
 * `queue.writeBuffer`.
 *
 * ### Pipeline state
 *
 * Color target: whatever `colorFormat` the caller passes (typically
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

export function createDebugSphereRenderer(
  device: GPUDevice,
  colorFormat: GPUTextureFormat,
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

  // ── Uniform buffer ────────────────────────────────────────────────────────
  //
  // Holds `SphereUniforms { mvp: mat4x4<f32> }` — 64 bytes, overwritten
  // once per draw call.
  const uniformBuffer = device.createBuffer({
    label: 'debugSphere-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  //
  // Group 0, binding 0: the SphereUniforms block, visible in the vertex
  // stage only (the fragment shader derives everything from the interpolated
  // localPos passed by the vertex stage).
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'debugSphere-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    label: 'debugSphere-bg',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
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
          format: colorFormat,
          // No blend descriptor = opaque replace.  The fragment already
          // emits alpha=1; no premultiplied or straight-alpha blending
          // is needed for an opaque foreground draw.
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',  // CCW = outward-facing (matches uvSphereMesh winding)
      cullMode: 'back',  // discard inward-facing (inner-surface) triangles
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, mvp: Float32Array): void {
    // Upload the caller-provided MVP matrix (16 floats = 64 bytes) into
    // SphereUniforms at offset 0.  The mvp is computed CPU-side and varies
    // per body; writing it here (not at pipeline creation time) lets the
    // same renderer draw multiple spheres in one frame by calling `draw`
    // multiple times with different mvp values.
    device.queue.writeBuffer(uniformBuffer, 0, mvp);

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

  const renderer: DebugSphereRenderer = {
    label: 'debugSphereRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
