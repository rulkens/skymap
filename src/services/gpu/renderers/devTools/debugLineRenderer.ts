/**
 * debugLineRenderer — the dedicated debug-draw pass's screen-space thick-line
 * renderer.
 *
 * ## Why a near-twin of markerLineRenderer rather than reuse it?
 *
 * The marker-line renderer is owned by the label director: its `setLines` is
 * the flush target of the producer-merge / declutter / fade machinery, and its
 * input `MarkerLine` carries id + fadeAlpha to support that reconcile. The
 * clip-path inspector wanted none of that — it precomputes a snapshot on a
 * button click and the pass uploads the whole speed-coloured route wholesale
 * each frame. Routing it through the label director (the approach we backed
 * out of) forced id-keying hacks because the director's change-signature
 * excludes positions. A second tiny renderer keyed off the leaner `DebugLine`
 * keeps the debug overlay fully decoupled from labels.
 *
 * The GPU technique is identical, so this REUSES the marker-line WESL shaders
 * (`shaders/markerLines/{vertex,fragment}.wesl`) and the same 80-byte
 * CameraUniforms prefix + 48-byte instance stride. The only divergences are the
 * input type (no id/fade) and a larger default `maxLines` — a clip path is
 * hundreds of route segments, not the 1–3 lines a marker overlay carries.
 *
 * See `markerLineRenderer.ts` for the full uniform-layout / blend-mode
 * rationale; it is not repeated here.
 */

import type { GpuContext } from '../../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { DebugLine } from '../../../../@types/rendering/DebugLine';
import type { DebugLineRenderer } from '../../../../@types/rendering/DebugLineRenderer';
import type { Vec2 } from '../../../../@types/math/Vec2';
import vsCode from '../../shaders/markerLines/vertex.wesl?static';
import fsCode from '../../shaders/markerLines/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';

/**
 * Per-instance stride, matching `VsIn` attributes 1–3 in markerLines/io.wesl:
 *   bytes  0..15  fromAndWidth  vec4<f32> — from.xyz, pixelWidth
 *   bytes 16..31  toAndAlpha    vec4<f32> — to.xyz, fadeAlpha (always 1 here)
 *   bytes 32..47  color         vec4<f32> — premultiplied rgba
 * 3 × vec4 = 48 bytes/instance.
 */
const LINE_INSTANCE_BYTES = 48;

const CORNER_BYTES = UNIT_QUAD_STRIP_CORNERS.byteLength;

/**
 * Construct a `DebugLineRenderer`. Pass a null `device` (via GpuContext) for
 * unit tests that exercise CPU state only — GPU creation is skipped and
 * `draw(...)` is a no-op.
 *
 * `targetFormat` is the colour-attachment format the pipeline writes into.
 * The debug overlay draws post-tone-map onto the swap chain, but the format is
 * passed EXPLICITLY rather than read off `ctx.format`, so the target is legible
 * at the construction site.
 *
 * `maxLines` defaults to 1024: a clip-path snapshot draws one route segment AND
 * one target-path segment per sample pair (2·(n−1), hundreds each at the
 * inspector's sampleCount) plus the 9-line scrub gizmo, so the buffer must be
 * far larger than the marker overlay's 64. `setLines` clamps silently, so this
 * ceiling must stay above 2·(sampleCount−1)+9.
 */
export function createDebugLineRenderer(
  ctx: GpuContext,
  targetFormat: GPUTextureFormat,
  maxLines = 1024,
): DebugLineRenderer {
  const device = ctx.device as GPUDevice | null;
  const format = targetFormat;

  const instanceBuf = new Float32Array(maxLines * (LINE_INSTANCE_BYTES / 4));
  let currentLineCount = 0;

  let pipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let gpuInstanceBuffer: GPUBuffer | null = null;
  let cornerBuffer: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;

  if (device) {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'debug-line-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });

    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'debugLines.vertex');
    const fsModule = createShaderModuleWithDevLog(device, fsCode, 'debugLines.fragment');

    pipeline = device.createRenderPipeline({
      label: 'debug-line-pipeline',
      layout: device.createPipelineLayout({
        label: 'debug-line-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: vsModule,
        entryPoint: 'vs',
        buffers: [
          UNIT_QUAD_VERTEX_LAYOUT,
          {
            arrayStride: LINE_INSTANCE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x4' }, // fromAndWidth
              { shaderLocation: 2, offset: 16, format: 'float32x4' }, // toAndAlpha
              { shaderLocation: 3, offset: 32, format: 'float32x4' }, // color
            ],
          },
        ],
      },
      fragment: {
        module: fsModule,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied-alpha OVER — debug lines occlude, not accumulate.
            blend: PREMULTIPLIED_OVER_BLEND,
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
      // No depthStencil — always-visible overlay (the approved design: the
      // route + gizmo must read even when occluded by sky content).
    });

    uniformBuffer = device.createBuffer({
      label: 'debug-line-uniforms',
      size: CAMERA_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    gpuInstanceBuffer = device.createBuffer({
      label: 'debug-line-instances',
      size: maxLines * LINE_INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    cornerBuffer = device.createBuffer({
      label: 'debug-line-corners',
      size: CORNER_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(cornerBuffer, 0, UNIT_QUAD_STRIP_CORNERS);

    bindGroup = device.createBindGroup({
      label: 'debug-line-bg',
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
  }

  function setLines(lines: DebugLine[]): void {
    currentLineCount = 0;

    const count = Math.min(lines.length, maxLines);
    for (let i = 0; i < count; i++) {
      const line = lines[i]!;
      const base = i * (LINE_INSTANCE_BYTES / 4); // 12 f32s per instance
      instanceBuf[base + 0] = line.from[0];
      instanceBuf[base + 1] = line.from[1];
      instanceBuf[base + 2] = line.from[2];
      instanceBuf[base + 3] = line.width;
      instanceBuf[base + 4] = line.to[0];
      instanceBuf[base + 5] = line.to[1];
      instanceBuf[base + 6] = line.to[2];
      // fadeAlpha slot — debug lines never fade, so a constant 1.0.
      instanceBuf[base + 7] = 1;
      instanceBuf[base + 8] = line.color[0]!;
      instanceBuf[base + 9] = line.color[1]!;
      instanceBuf[base + 10] = line.color[2]!;
      instanceBuf[base + 11] = line.color[3]!;
      currentLineCount++;
    }

    if (!device) return;
    if (gpuInstanceBuffer && currentLineCount > 0) {
      device.queue.writeBuffer(
        gpuInstanceBuffer,
        0,
        instanceBuf,
        0,
        currentLineCount * (LINE_INSTANCE_BYTES / 4),
      );
    }
  }

  function draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportSize: Vec2): void {
    if (
      !device ||
      !pipeline ||
      !bindGroup ||
      !uniformBuffer ||
      !cornerBuffer ||
      !gpuInstanceBuffer
    ) {
      return;
    }
    if (currentLineCount === 0) return;

    const uni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    writeCameraPrefix(uni, viewProj, viewportSize);
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, cornerBuffer);
    pass.setVertexBuffer(1, gpuInstanceBuffer);
    pass.draw(4, currentLineCount, 0, 0);
  }

  function lineCount(): number {
    return currentLineCount;
  }

  function destroy(): void {
    uniformBuffer?.destroy();
    gpuInstanceBuffer?.destroy();
    cornerBuffer?.destroy();
  }

  const renderer: DebugLineRenderer = {
    label: 'debugLineRenderer',
    setLines,
    draw,
    lineCount,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
