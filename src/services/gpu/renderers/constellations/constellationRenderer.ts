/**
 * constellationRenderer — GPU pipeline for the true-3D constellation
 * stick-figure overlay.
 *
 * A thin sibling of `filamentRenderer`: the same instanced-quad thick-line
 * technique (one quad instance per line segment, expanded to a screen-aligned
 * rectangle in the vertex stage — WebGPU line-list is 1-pixel-wide only, by
 * spec), the same additive HDR target, and the same per-frame fade uniform. It
 * differs only in its data source and camera seam:
 *
 *   - Data: the CPU-resident `ConstellationsArtifact` (line segments between
 *     real stars). `upload` builds the ABSOLUTE-position instance data once (the
 *     segment set is a static, tier-agnostic `constellations.json`) and caches
 *     it; endpoints are scaled parsecs → world Mpc at upload
 *     (`buildConstellationInstances`).
 *   - Camera: the caller (the NEAR0 pass) hands the f64-rebased view-projection
 *     AND the camera position every frame. The renderer re-expresses each cached
 *     absolute endpoint as `pos − camPos` into a scratch buffer and re-uploads
 *     it, so the f32 shader multiplies a well-conditioned camera-relative
 *     position by a rebased vp — the `starPointsLayer` precision seam (no
 *     catastrophic cancellation on close approach). The per-frame re-write is
 *     ~743 segments × 32 B, trivially cheap.
 *
 * Buffers:
 *
 *   indexBuffer (static)      : 6 × uint16 → two-triangle quad
 *   quadVertexBuffer (static) : 4 × vec2<f32> → shared unit-quad corners
 *   instanceBuffer            : segmentCount × 8 × f32 → per-segment endpoints
 *                               (camera-relative, re-written each frame)
 *   uniformBuffer             : 112 bytes (CameraUniforms prefix + halfWidthPx +
 *                               intensity + pad + lineColor vec3 + tail pad)
 *   fadeBuffer                : 16 bytes (FadeUniforms — per-frame opacity)
 *
 * Public API:
 *   - createConstellationRenderer(device, targetFormat, fadeBgl)
 *   - upload(artifact)  → caches the absolute instance data + sizes the buffer (once)
 *   - hasData()         → whether a drawable segment set is committed
 *   - draw(pass, viewProj, viewportPx, halfWidthPx, intensity, fadeOpacity, camPos, lineColor)
 *   - destroy()         → releases all GPU resources
 *
 * Factory (not class) form matches `createFilamentRenderer` and the other
 * subsystem factories; the closure carries the stateful per-artifact `let`
 * bindings the upload mutates.
 */

import vsCode from '../../shaders/constellations/vertex.wesl?static';
import fsCode from '../../shaders/constellations/fragment.wesl?static';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { ConstellationRenderer } from '../../../../@types/rendering/ConstellationRenderer';
import type { ConstellationsArtifact } from '../../../../@types/loading/ConstellationsArtifact';
import type { FadeUniformsBgl } from '../../../../@types/rendering/FadeUniformsBgl';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { buildConstellationInstances, FLOATS_PER_SEGMENT } from './buildConstellationInstances';

// Uniform block layout, mirroring 'struct Uniforms' in
// 'shaders/constellations/io.wesl'. Bytes 0..79 are the shared 'CameraUniforms'
// prefix (lib/camera.wesl); the two scalar params sit at offsets 80/84; an 8B
// pad carries the vec3 lineColor to its required 16-byte boundary at 96; a final
// 4B pad rounds the struct to 112 bytes (a 16-byte multiple).
//
//   offset  0..63 : viewProj     mat4x4<f32>   (CameraUniforms.viewProj)
//   offset 64..71 : viewportPx   vec2<f32>     (CameraUniforms.viewportPx)
//   offset 72..79 : _pad0, _pad1 2 × f32       (CameraUniforms reserved)
//   offset 80..83 : halfWidthPx  f32
//   offset 84..87 : intensity    f32
//   offset 88..95 : _pad0, _pad1 2 × f32       (vec3 alignment pad)
//   offset 96..107: lineColor    vec3<f32>
//   offset 108..111: _pad2       f32           (Uniforms tail pad)
export const CONSTELLATION_UNIFORM_BYTES = 112;
/** f32-index of `halfWidthPx` in the packed uniform (byte 80 / 4). */
export const CONSTELLATION_HALFWIDTH_F32 = 20;
/** f32-index of `intensity` in the packed uniform (byte 84 / 4). */
export const CONSTELLATION_INTENSITY_F32 = 21;
/** f32-index of `lineColor`'s first lane in the packed uniform (byte 96 / 4). */
export const CONSTELLATION_COLOR_F32 = 24;

export function createConstellationRenderer(
  device: GPUDevice,
  /**
   * The colour-attachment format the pipeline writes into — the HDR offscreen
   * (`rgba16float`) in skymap, so the additive figure lines accumulate into the
   * same float buffer the stars/galaxies write and ride the shared tone-map.
   * Passed explicitly (never read off a swap-chain `format`).
   */
  targetFormat: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
): ConstellationRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'constellations.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'constellations.fragment');

  const uniformBuffer = device.createBuffer({
    label: 'constellations-uniform-buffer',
    size: CONSTELLATION_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Static index buffer: two triangles forming the quad.
  const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
  const indexBuffer = device.createBuffer({
    label: 'constellations-index-buffer',
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // Static quad-corner buffer: 4 vertices × vec2 = 32 bytes.
  const quadVertexBuffer = device.createBuffer({
    label: 'constellations-quad-vertex-buffer',
    size: UNIT_QUAD_STRIP_CORNERS.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(quadVertexBuffer, 0, UNIT_QUAD_STRIP_CORNERS);

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'constellations-bgl-uniforms',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    label: 'constellations-bg-uniforms',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const pipeline = device.createRenderPipeline({
    label: 'constellations-pipeline',
    layout: device.createPipelineLayout({
      label: 'constellations-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout, fadeBgl],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        // Per-quad-vertex: the shared unit-quad UV at location 0.
        UNIT_QUAD_VERTEX_LAYOUT,
        // Per-instance: aWorld + aAppMag + bWorld + bAppMag (32-byte stride).
        {
          arrayStride: FLOATS_PER_SEGMENT * 4,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x3' }, // aWorld
            { shaderLocation: 2, offset: 12, format: 'float32' }, // aAppMag
            { shaderLocation: 3, offset: 16, format: 'float32x3' }, // bWorld
            { shaderLocation: 4, offset: 28, format: 'float32' }, // bAppMag
          ],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      // Additive blending — the figure lines glow over the starfield without
      // occluding it, and overlapping segments sum rather than clip.
      targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
    // No depth attachment — the HDR pass is depthless additive, same as
    // filaments / star points.
  });

  // ── Stateful per-artifact bookkeeping ─────────────────────────────
  //
  // Null/zero means "no artifact uploaded yet"; `draw` early-returns. `upload`
  // runs once (the slot commit guards on it), caching the ABSOLUTE-position
  // instance data; `draw` subtracts the per-frame camera position from it into
  // `relativeScratch` and re-uploads that camera-relative buffer.
  let instanceBuffer: GPUBuffer | null = null;
  let segmentCount = 0;
  // The cached absolute-position instance data (world Mpc). Reused every frame:
  // draw copies it minus camPos into relativeScratch. A re-upload rebuilds both.
  let absoluteData: Float32Array | null = null;
  let relativeScratch: Float32Array | null = null;

  // Per-handle FadeUniforms buffer + bind group, created lazily on first upload.
  let fadeBuffer: GPUBuffer | null = null;
  let fadeBindGroup: GPUBindGroup | null = null;
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);

  // Reusable scratch for the per-frame uniform write.
  const uniformScratch = new ArrayBuffer(CONSTELLATION_UNIFORM_BYTES);
  const uniformF32 = new Float32Array(uniformScratch);

  function upload(artifact: ConstellationsArtifact): void {
    const built = buildConstellationInstances(artifact);
    segmentCount = built.segmentCount;
    if (built.segmentCount === 0) {
      instanceBuffer?.destroy();
      instanceBuffer = null;
      absoluteData = null;
      relativeScratch = null;
      return;
    }
    // Cache the absolute-position instance data + a same-size scratch for the
    // per-frame camera-relative re-write. The buffer is sized here but written
    // per frame in draw (no absolute write — it would only be overwritten).
    absoluteData = built.data;
    relativeScratch = new Float32Array(built.data.length);
    instanceBuffer?.destroy();
    instanceBuffer = device.createBuffer({
      label: 'constellations-instance-buffer',
      size: built.data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    if (fadeBuffer === null) {
      fadeBuffer = device.createBuffer({
        label: 'constellations-fade-uniform',
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      fadeBindGroup = device.createBindGroup({
        label: 'constellations-fade-bg',
        layout: fadeBgl,
        entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
      });
    }
  }

  function hasData(): boolean {
    return instanceBuffer !== null;
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    halfWidthPx: number,
    intensity: number,
    fadeOpacity: number,
    /**
     * The NEAR0-origin camera position (world Mpc). Subtracted from each cached
     * absolute endpoint to re-express the segment set camera-relative, pairing
     * with the caller's f64-rebased `viewProj` — the `starPointsLayer` seam.
     */
    camPos: Vec3,
    /**
     * The steel-blue tone every figure emits (RGB). Defined once in
     * `constellationsLayer.ts` (`CONSTELLATION_LINE_COLOR`) and packed into the
     * uniform's `lineColor` slot; the fragment reads it directly.
     */
    lineColor: Vec3,
  ): void {
    if (segmentCount === 0 || !instanceBuffer || !fadeBuffer || !fadeBindGroup) return;
    if (!absoluteData || !relativeScratch) return;

    // Re-express every endpoint camera-relative (`pos − camPos`) into the scratch
    // and re-upload. Only the two xyz triples move; the apparent-magnitude slots
    // (floats 3 and 7 of each 8-float segment) copy straight through. The pass
    // hands the matching f64-rebased vp, so the f32 shader multiply is
    // well-conditioned even on close approach (module header).
    const abs = absoluteData;
    const rel = relativeScratch;
    const cx = camPos[0];
    const cy = camPos[1];
    const cz = camPos[2];
    for (let o = 0; o < abs.length; o += FLOATS_PER_SEGMENT) {
      rel[o + 0] = abs[o + 0]! - cx;
      rel[o + 1] = abs[o + 1]! - cy;
      rel[o + 2] = abs[o + 2]! - cz;
      rel[o + 3] = abs[o + 3]!; // aAppMag
      rel[o + 4] = abs[o + 4]! - cx;
      rel[o + 5] = abs[o + 5]! - cy;
      rel[o + 6] = abs[o + 6]! - cz;
      rel[o + 7] = abs[o + 7]!; // bAppMag
    }
    device.queue.writeBuffer(instanceBuffer, 0, rel);

    // Pack the 112-byte Uniforms struct (byte layout documented on
    // CONSTELLATION_UNIFORM_BYTES above). Reused scratch, so the named pads are
    // left as their prior contents — they are never read by the shader.
    writeCameraPrefix(uniformF32, viewProj, viewportPx);
    uniformF32[CONSTELLATION_HALFWIDTH_F32] = halfWidthPx;
    uniformF32[CONSTELLATION_INTENSITY_F32] = intensity;
    uniformF32[CONSTELLATION_COLOR_F32] = lineColor[0];
    uniformF32[CONSTELLATION_COLOR_F32 + 1] = lineColor[1];
    uniformF32[CONSTELLATION_COLOR_F32 + 2] = lineColor[2];
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    // Per-frame fade opacity into the shared FadeUniforms buffer.
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

  const renderer: ConstellationRenderer = {
    label: 'constellationRenderer',
    upload,
    hasData,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
