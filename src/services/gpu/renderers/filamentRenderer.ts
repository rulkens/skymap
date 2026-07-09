/**
 * FilamentRenderer — GPU pipeline for the cosmic-web filament skeleton
 * overlay.
 *
 * Strategy: instanced-quad line technique (see `shaders/filaments.wgsl`).
 * Each filament segment becomes one quad instance; the vertex shader
 * expands the unit-square UV into a thick screen-aligned segment between
 * the two endpoints.  This is necessary because native WebGPU line
 * topology is hardcoded to 1-pixel width.
 *
 * Buffers:
 *
 *   indexBuffer (static)        :  6 × uint16  → two-triangle quad
 *   quadVertexBuffer (static)   :  4 × vec2<f32> → corner UVs
 *   segmentInstanceBuffer       :  segmentCount × 8 × f32 → per-segment endpoints
 *   uniformBuffer               :  96 bytes (CameraUniforms prefix + halfWidth + intensityScale + tail pad)
 *
 * Public API:
 *   - createFilamentRenderer(device, targetFormat, fadeBgl)
 *   - upload(cloud: FilamentCloud)  → builds the instance buffer
 *   - draw(pass, viewProj, viewportPx, halfWidthPx, intensityScale, fadeOpacity)
 *   - clear()                       → drops the instance buffer
 *   - destroy()                     → releases all GPU resources
 *
 * ### Factory shape
 *
 * This module exports a factory function `createFilamentRenderer` rather than
 * a class, matching the convention used by `createPickRenderer` and the other
 * subsystem factories. The distinguishing detail vs stateless drawers is that
 * this renderer holds *stateful* per-cloud data — the segment instance buffer,
 * the segment count, and the lazily-created fade buffer — so the closure
 * carries `let` bindings that the upload state machine mutates rather than
 * the constants of stateless drawers.
 */
import vsCode from '../shaders/filaments/vertex.wesl?static';
import fsCode from '../shaders/filaments/fragment.wesl?static';
import type { FilamentCloud } from '../../../@types/data/filament/FilamentCloud';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { FilamentRenderer } from '../../../@types/rendering/FilamentRenderer';
import type { Mat4 } from 'wgpu-matrix';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import type { Vec2 } from '../../../@types/math/Vec2';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { clampFilamentIntensity } from '../../../utils/clampFilamentIntensity';

const FLOATS_PER_SEGMENT = 8; // startxyz + startD + endxyz + endD

// Uniform block layout, mirroring 'struct Uniforms' in
// 'shaders/filaments.wesl'. The first 80 bytes are the shared
// 'CameraUniforms' prefix from 'shaders/lib/camera.wesl'; the
// renderer-specific scalars sit AFTER it in offsets 80..87. The
// trailing 8B pad rounds up to a 16-byte multiple — WebGPU would
// round the buffer size anyway, but writing the pad explicitly keeps
// the JS-side layout obvious and grep-able.
//
//   offset  0..63 : viewProj       mat4x4<f32>   (CameraUniforms.viewProj)
//   offset 64..71 : viewportPx     vec2<f32>     (CameraUniforms.viewportPx)
//   offset 72..79 : _pad0, _pad1   2 × f32       (CameraUniforms reserved)
//   offset 80..83 : halfWidthPx    f32
//   offset 84..87 : intensityScale f32
//   offset 88..95 : _pad0, _pad1   2 × f32       (Uniforms tail pad)
// Total: 96 bytes.
const UNIFORM_BYTES = 96;

/**
 * Build a flat per-segment instance array from a `FilamentCloud`.  One
 * instance per consecutive (v_i, v_{i+1}) pair within each strip.
 *
 * Public so tests can exercise the layout without instantiating the
 * full GPU pipeline.
 */
export function buildSegmentInstances(cloud: FilamentCloud): {
  segmentCount: number;
  data: Float32Array;
} {
  // Total segment count = sum over strips of (verts - 1) = totalVerts - stripCount.
  const segmentCount = cloud.vertexCount - cloud.stripCount;
  if (segmentCount <= 0) {
    return { segmentCount: 0, data: new Float32Array(0) };
  }
  const data = new Float32Array(segmentCount * FLOATS_PER_SEGMENT);

  let outIdx = 0;
  for (let s = 0; s < cloud.stripCount; s++) {
    const lo = cloud.stripOffsets[s]!;
    const hi = cloud.stripOffsets[s + 1]!;
    for (let v = lo; v < hi - 1; v++) {
      const a = v * 4;
      const b = (v + 1) * 4;
      data[outIdx + 0] = cloud.vertices[a + 0]!;
      data[outIdx + 1] = cloud.vertices[a + 1]!;
      data[outIdx + 2] = cloud.vertices[a + 2]!;
      data[outIdx + 3] = cloud.vertices[a + 3]!;
      data[outIdx + 4] = cloud.vertices[b + 0]!;
      data[outIdx + 5] = cloud.vertices[b + 1]!;
      data[outIdx + 6] = cloud.vertices[b + 2]!;
      data[outIdx + 7] = cloud.vertices[b + 3]!;
      outIdx += FLOATS_PER_SEGMENT;
    }
  }
  return { segmentCount, data };
}

export function createFilamentRenderer(
  device: GPUDevice,
  /**
   * The colour-attachment format the pipeline writes into.  In skymap
   * this is the HDR offscreen target (`rgba16float`).  Filaments
   * accumulate additively into the same float buffer the points/quads/disks
   * write, then the tone-map pass compresses everything onto the swap chain.
   * Drawing direct to the swap chain would clip on overlap — exactly what the
   * visual cosmic-web scenes need to NOT do.  Passed explicitly (never read
   * off a `GpuContext.format`, which is always the swap-chain format).
   */
  targetFormat: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
): FilamentRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'filaments.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'filaments.fragment');

  const uniformBuffer = device.createBuffer({
    label: 'filaments-uniform-buffer',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Static index buffer: two triangles forming the quad.
  const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
  const indexBuffer = device.createBuffer({
    label: 'filaments-index-buffer',
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // Static quad-corner buffer: 4 vertices × vec2 = 32 bytes.
  const quadCorners = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  const quadVertexBuffer = device.createBuffer({
    label: 'filaments-quad-vertex-buffer',
    size: quadCorners.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(quadVertexBuffer, 0, quadCorners);

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'filaments-bgl-uniforms',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    label: 'filaments-bg-uniforms',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const pipeline = device.createRenderPipeline({
    label: 'filaments-pipeline',
    layout: device.createPipelineLayout({
      label: 'filaments-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout, fadeBgl],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        // Per-quad-vertex: uv vec2
        {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
        },
        // Per-instance: startxyz + startDensity + endxyz + endDensity
        {
          arrayStride: FLOATS_PER_SEGMENT * 4,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x3' }, // startPos
            { shaderLocation: 2, offset: 12, format: 'float32' }, // startDensity
            { shaderLocation: 3, offset: 16, format: 'float32x3' }, // endPos
            { shaderLocation: 4, offset: 28, format: 'float32' }, // endDensity
          ],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Additive blending — filaments glow over the existing scene
          // without occluding the point cloud below them.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
    // Note: the HDR pass in `renderFrame.ts` does NOT attach a depth
    // texture — points/quads/disks all skip depth.  Filaments follow
    // the same convention; if a future plan adds a depth attachment
    // to the HDR pass, mirror the points-pipeline's depthStencil
    // block here.
  });

  // ── Stateful per-cloud bookkeeping ────────────────────────────────
  //
  // Closure-captured `let` bindings — they're reassigned by `upload`
  // and `clear`.  The class form held these as private fields; the
  // factory form makes the mutability obvious by leaving them at
  // top scope of the closure rather than nested inside `this`.
  //
  // `instanceBuffer` and `segmentCount` track the currently-loaded
  // cloud's GPU vertex buffer and its segment count.  Null/zero
  // means "no cloud uploaded yet" (or `clear()` has been called),
  // and `draw()` early-returns.
  let instanceBuffer: GPUBuffer | null = null;
  let segmentCount = 0;

  // Per-handle FadeUniforms GPU buffer + bind group. Constructed lazily
  // on first upload (the filament cloud may never load in production
  // if the .bin file is absent), destroyed in destroy(). Subsequent
  // uploads reuse the buffer — only the per-frame opacity write changes.
  let fadeBuffer: GPUBuffer | null = null;
  let fadeBindGroup: GPUBindGroup | null = null;
  // Reusable scratch for the per-frame fade writeBuffer call.
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);

  function upload(cloud: FilamentCloud): void {
    const built = buildSegmentInstances(cloud);
    segmentCount = built.segmentCount;
    if (built.segmentCount === 0) {
      instanceBuffer?.destroy();
      instanceBuffer = null;
      return;
    }
    instanceBuffer?.destroy();
    instanceBuffer = device.createBuffer({
      label: 'filaments-instance-buffer',
      size: built.data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(instanceBuffer, 0, built.data);

    if (fadeBuffer === null) {
      fadeBuffer = device.createBuffer({
        label: 'filaments-fade-uniform',
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      fadeBindGroup = device.createBindGroup({
        label: 'filaments-fade-bg',
        layout: fadeBgl,
        entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
      });
    }
  }

  function clear(): void {
    instanceBuffer?.destroy();
    instanceBuffer = null;
    segmentCount = 0;
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    halfWidthPx: number,
    intensityScale: number,
    fadeOpacity: number,
  ): void {
    if (segmentCount === 0 || !instanceBuffer || !fadeBuffer || !fadeBindGroup) return;

    // Pack the 96-byte Uniforms struct. Byte layout is documented on
    // the UNIFORM_BYTES const at module top — keep slot indices here
    // in sync with that table (mat4 occupies f32[0..15]; viewportPx at
    // 16..17; the two reserved pads at 18..19; halfWidthPx at 20;
    // intensityScale at 21; the two trailing pads at 22..23).
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    f32.set(viewProj as Float32Array, 0);
    f32[16] = viewportPx[0];
    f32[17] = viewportPx[1];
    f32[20] = halfWidthPx;
    // Clamp to [0,1] at point of use: a negative value would drive a negative
    // additive-blend alpha (undefined). The store holds raw intent.
    f32[21] = clampFilamentIntensity(intensityScale);
    device.queue.writeBuffer(uniformBuffer, 0, buf);

    // Write the per-frame fade.opacity from the registry-supplied value.
    fadeScratchF32[0] = fadeOpacity;
    device.queue.writeBuffer(fadeBuffer, 0, fadeScratchBuffer);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setBindGroup(1, fadeBindGroup);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.setVertexBuffer(0, quadVertexBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.drawIndexed(6, segmentCount);
  }

  function destroy(): void {
    uniformBuffer.destroy();
    indexBuffer.destroy();
    quadVertexBuffer.destroy();
    instanceBuffer?.destroy();
    fadeBuffer?.destroy();
  }

  // Whether a drawable cloud is committed — the filaments fade row guards on
  // this (same demand-loaded pattern as flowFieldRenderer.fieldLoaded): a fade
  // toward "visible" is suppressed until there is something to fade in.
  function hasCloud(): boolean {
    return instanceBuffer !== null;
  }

  const renderer: FilamentRenderer = {
    label: 'filamentRenderer',
    upload,
    clear,
    draw,
    hasCloud,
    destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
