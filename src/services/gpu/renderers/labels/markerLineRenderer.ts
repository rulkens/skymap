/**
 * markerLineRenderer — instanced thick-line overlay for world-anchored segments: each expands
 * to a screen-aligned quad between its endpoints, anti-aliased perpendicular to the line.
 *
 * Per-instance attributes carry the full line state, so the only binding is the 80-byte shared
 * `CameraUniforms` prefix (`lib/cameraUniforms.ts`, twin of `shaders/lib/camera.wesl`; its
 * trailing pad f32 must stay zero). Premultiplied OVER blend, NOT additive: opaque UI indicators
 * must replace dark pixels, not accumulate; see `shaders/markerLines/io.wesl`.
 */

import type { GpuContext } from '../../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MarkerLine } from '../../../../@types/rendering/MarkerLine';
import type { MarkerLineRenderer } from '../../../../@types/rendering/MarkerLineRenderer';
import type { Vec2 } from '../../../../@types/math/Vec2';
import vsCode from '../../shaders/markerLines/vertex.wesl?static';
import vsOccludeCode from '../../shaders/markerLines/vertexOcclude.wesl?static';
import fsCode from '../../shaders/markerLines/fragment.wesl?static';
import fsOccludeCode from '../../shaders/markerLines/fragmentOcclude.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import type { OverlaySceneOcclusion } from '../../../../@types/rendering/OverlaySceneOcclusion';
import {
  OCCLUSION_COVERAGE_GROUP_INDEX,
  OCCLUSION_COVERAGE_LAYOUT_DESC,
  createOcclusionCoverageBindGroup,
  createOcclusionDepthFrameBuffer,
  writeOcclusionDepthFrame,
} from './occlusionCoverageGroup';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';
import { MARKER_LINE_INSTANCE_LAYOUT } from '../../lib/markerLineInstanceLayout';

// See `lib/markerLineInstanceLayout.ts` for the byte map.
const LINE_INSTANCE_BYTES = MARKER_LINE_INSTANCE_LAYOUT.arrayStride;

const CORNER_BYTES = UNIT_QUAD_STRIP_CORNERS.byteLength; // 32 bytes (4 × 2 × 4)

// `setLines` grows it in power-of-two steps.
const INITIAL_LINE_CAPACITY = 64;

/**
 * A `device: null` GpuContext skips GPU creation and makes `draw` a no-op, for CPU-only tests.
 * `targetFormat` is the swap-chain format, passed explicitly so the target is legible here.
 * `opts.occludeAgainstScene` adds the group(1) coverage binding and `fragmentOcclude.wesl`
 * (per-pixel attenuation behind solar-system bodies); omitted keeps the plain single-BGL pipeline.
 */
export function createMarkerLineRenderer(
  ctx: GpuContext,
  targetFormat: GPUTextureFormat,
  opts?: { occludeAgainstScene?: boolean },
): MarkerLineRenderer {
  // The cast lets a test pass `device: null`; every use below null-checks.
  const device = ctx.device as GPUDevice | null;
  const format = targetFormat;

  // 14 f32 per instance (56 bytes = LINE_INSTANCE_BYTES), all f32, so one Float32Array suffices.
  let capacity = 0;
  let instanceBuf = new Float32Array(0);

  let currentLineCount = 0;

  // The occlusion instance builds BOTH pipelines and picks per draw; others only `plainPipeline`.
  let plainPipeline: GPURenderPipeline | null = null;
  let occludePipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let gpuInstanceBuffer: GPUBuffer | null = null;
  let cornerBuffer: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;
  // Null off the occlusion path, which is what gates `draw`'s occlusion branch.
  let occlusionCoverageBGL: GPUBindGroupLayout | null = null;
  let occlusionDepthFrameBuffer: GPUBuffer | null = null;

  const occludesScene = opts?.occludeAgainstScene === true;

  // Sizes the CPU scratch array and the GPU instance buffer; `setLines` re-enters on growth.
  function allocate(newCapacity: number): void {
    capacity = newCapacity;
    instanceBuf = new Float32Array(capacity * (LINE_INSTANCE_BYTES / 4));
    if (!device) return;
    // WebGPU defers a destroyed buffer's reclaim past queued GPU work reading it.
    gpuInstanceBuffer?.destroy();
    gpuInstanceBuffer = device.createBuffer({
      label: 'marker-line-instances',
      size: capacity * LINE_INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
  allocate(INITIAL_LINE_CAPACITY);

  if (device) {
    // Matches `vertex.wesl`'s `@group(0) @binding(0)`; the fragment stage binds nothing.
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'marker-line-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });

    // Retained so `draw` can rebuild the per-frame bind group (the colour view changes on resize).
    if (occludesScene) {
      occlusionCoverageBGL = device.createBindGroupLayout(OCCLUSION_COVERAGE_LAYOUT_DESC);
      occlusionDepthFrameBuffer = createOcclusionDepthFrameBuffer(
        device,
        'marker-line-depth-frame',
      );
    }

    // `draw` takes `occludePipeline` only when handed a scene colour view THIS frame; a frame
    // with no foreground body falls back to `plainPipeline` rather than an occlusion draw
    // with group(1) unbound.
    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'markerLines.vertex');

    // Buffer 0 is the unit corner quad (`uv.x` picks the endpoint, `uv.y` the ±half-width side).
    const vertexBuffers: GPUVertexBufferLayout[] = [
      UNIT_QUAD_VERTEX_LAYOUT,
      MARKER_LINE_INSTANCE_LAYOUT,
    ];
    const colorTargets: GPUColorTargetState[] = [{ format, blend: PREMULTIPLIED_OVER_BLEND }];

    const fsPlainModule = createShaderModuleWithDevLog(device, fsCode, 'markerLines.fragment');
    plainPipeline = device.createRenderPipeline({
      label: 'marker-line-pipeline',
      layout: device.createPipelineLayout({
        label: 'marker-line-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: { module: vsModule, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: { module: fsPlainModule, entryPoint: 'fs', targets: colorTargets },
      primitive: { topology: 'triangle-strip' },
    });

    if (occlusionCoverageBGL) {
      const fsOccludeModule = createShaderModuleWithDevLog(
        device,
        fsOccludeCode,
        'markerLines.fragmentOcclude',
      );
      // A SEPARATE module: lib::sceneDepth statically pulls in group(1) bindings, which
      // the plain pipeline's group(1)-less layout would reject.
      const vsOccludeModule = createShaderModuleWithDevLog(
        device,
        vsOccludeCode,
        'markerLines.vertexOcclude',
      );
      occludePipeline = device.createRenderPipeline({
        label: 'marker-line-pipeline-occlude',
        layout: device.createPipelineLayout({
          label: 'marker-line-pipeline-occlude-layout',
          bindGroupLayouts: [bindGroupLayout, occlusionCoverageBGL],
        }),
        vertex: { module: vsOccludeModule, entryPoint: 'vsOcclude', buffers: vertexBuffers },
        fragment: { module: fsOccludeModule, entryPoint: 'fs', targets: colorTargets },
        primitive: { topology: 'triangle-strip' },
      });
    }

    uniformBuffer = device.createBuffer({
      label: 'marker-line-uniforms',
      size: CAMERA_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    cornerBuffer = device.createBuffer({
      label: 'marker-line-corners',
      size: CORNER_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(cornerBuffer, 0, UNIT_QUAD_STRIP_CORNERS);

    bindGroup = device.createBindGroup({
      label: 'marker-line-bg',
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
  }

  function setLines(lines: MarkerLine[]): void {
    currentLineCount = 0;

    // Rare, never per frame; the instance buffer is bound per draw, so no bind group pins the old one.
    if (lines.length > capacity) allocate(2 ** Math.ceil(Math.log2(lines.length)));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // [0..2] fromWorld Mpc, [3] pixelWidth (CSS px), [4..6] toWorld Mpc, [7] fadeAlpha,
      // [8..11] premultiplied rgba, [12] occludeWeight (1 = take scene attenuation),
      // [13] occludeNearKm (eye to the subject's near surface).
      const base = i * (LINE_INSTANCE_BYTES / 4);
      instanceBuf[base + 0] = line.fromWorld[0];
      instanceBuf[base + 1] = line.fromWorld[1];
      instanceBuf[base + 2] = line.fromWorld[2];
      instanceBuf[base + 3] = line.pixelWidth;
      instanceBuf[base + 4] = line.toWorld[0];
      instanceBuf[base + 5] = line.toWorld[1];
      instanceBuf[base + 6] = line.toWorld[2];
      instanceBuf[base + 7] = line.fadeAlpha ?? 1;
      instanceBuf[base + 8] = line.color[0]!;
      instanceBuf[base + 9] = line.color[1]!;
      instanceBuf[base + 10] = line.color[2]!;
      instanceBuf[base + 11] = line.color[3]!;
      instanceBuf[base + 12] = line.occludeWeight ?? 1;
      instanceBuf[base + 13] = line.occludeNearKm ?? 0;

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

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    pxPerRad: number,
    scene?: OverlaySceneOcclusion,
  ): void {
    if (
      !device ||
      !plainPipeline ||
      !bindGroup ||
      !uniformBuffer ||
      !cornerBuffer ||
      !gpuInstanceBuffer
    ) {
      return;
    }
    if (currentLineCount === 0) return;

    // The pad float 19 stays zero: the shared writer leaves it untouched.
    const uni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    writeCameraPrefix(uni, viewProj, viewportSize, pxPerRad);
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    if (occlusionCoverageBGL && occludePipeline && occlusionDepthFrameBuffer && scene) {
      pass.setPipeline(occludePipeline);
      pass.setBindGroup(0, bindGroup);
      writeOcclusionDepthFrame(device, occlusionDepthFrameBuffer, scene.frame, viewportSize);
      const coverageBindGroup = createOcclusionCoverageBindGroup(
        device,
        occlusionCoverageBGL,
        scene,
        occlusionDepthFrameBuffer,
      );
      pass.setBindGroup(OCCLUSION_COVERAGE_GROUP_INDEX, coverageBindGroup);
    } else {
      pass.setPipeline(plainPipeline);
      pass.setBindGroup(0, bindGroup);
    }
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
    occlusionDepthFrameBuffer?.destroy();
  }

  const renderer: MarkerLineRenderer = {
    label: 'markerLineRenderer',
    setLines,
    draw,
    lineCount,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
