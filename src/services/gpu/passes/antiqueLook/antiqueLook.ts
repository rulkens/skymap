/**
 * antiqueLook — the `stylize` step: four full-screen passes, in order.
 *   1. paper  — the sheet, baked only when its row was (re)allocated;
 *   2. reduce — print → quarter-res `wash` (low band) + `peaks` (MRT);
 *   3. peaks  — non-maximum suppression → `stars`;
 *   4. plate  — everything inked onto the swap chain.
 * (2b. glow — `wash` → 1/16-res `glow`, the low band past star scale.)
 * The look itself lives in `shaders/antiqueLook/`; this file only binds.
 * Bind groups are rebuilt per encode: every source view is recreated on resize.
 */

import vsCode from '../../shaders/antiqueLook/vertex.wesl?static';
import paperCode from '../../shaders/antiqueLook/paperBake.wesl?static';
import reduceCode from '../../shaders/antiqueLook/reduce.wesl?static';
import glowCode from '../../shaders/antiqueLook/glow.wesl?static';
import peaksCode from '../../shaders/antiqueLook/peaks.wesl?static';
import plateCode from '../../shaders/antiqueLook/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import {
  ANTIQUE_ORNAMENT_BYTES,
  ANTIQUE_REFERENCE_HEIGHT_CSS,
  ANTIQUE_TARGETS,
  ANTIQUE_UNIFORM_BYTES,
} from '../../../../data/rendering/antiqueLook';
import { HDR_TARGET_FORMAT } from '../../../../data/renderTargetFormats';
import { ANTIQUE_ORNAMENTS } from '../../../../data/rendering/antiqueOrnaments';
import { ANTIQUE_ORNAMENT_ATLAS } from '../../../../data/rendering/antiqueOrnamentAtlas';
import { packAntiqueUniforms } from '../../../../utils/gpu/antiqueLook/packAntiqueUniforms';
import { packAntiqueOrnaments } from '../../../../utils/gpu/antiqueLook/packAntiqueOrnaments';
import { placeAntiqueOrnaments } from '../../../../utils/gpu/antiqueLook/placeAntiqueOrnaments';
import { fetchAntiqueBitmap } from '../../../../utils/gpu/antiqueLook/fetchAntiqueBitmap';
import { viewBasis } from '../../../../utils/camera/projection/viewBasis';
import { viewCornerRays } from '../../../../utils/camera/projection/viewCornerRays';
import { timestampSpread } from '../../../../utils/gpu/timestampSpread';
import type { AntiqueLook } from '../../../../@types/rendering/AntiqueLook';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { GpuTimingService } from '../../../../@types/gpu/timing/GpuTimingService';
import type { Renderer } from '../../../../@types/rendering/Renderer';

/** A fixed seed keeps the sheet identical across reloads: a print does not change. */
const PAPER_SEED = 17.0;

type Binding = 'texture' | 'uniform' | 'sampler';

export function createAntiqueLook(init: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
}): AntiqueLook {
  const { device, targetFormat } = init;
  const vertex = {
    module: createShaderModuleWithDevLog(device, vsCode, 'antiqueLook.vertex'),
    entryPoint: 'vs',
  };

  function layoutOf(label: string, bindings: readonly Binding[]): GPUBindGroupLayout {
    return device.createBindGroupLayout({
      label: `antique-look-${label}-bgl`,
      entries: bindings.map(
        (kind, binding): GPUBindGroupLayoutEntry => ({
          binding,
          visibility: GPUShaderStage.FRAGMENT,
          ...(kind === 'texture' ? { texture: { sampleType: 'float' } } : {}),
          ...(kind === 'uniform' ? { buffer: { type: 'uniform' } } : {}),
          ...(kind === 'sampler' ? { sampler: { type: 'filtering' } } : {}),
        }),
      ),
    });
  }

  function pipelineOf(
    label: string,
    code: string,
    layout: GPUBindGroupLayout,
    formats: readonly GPUTextureFormat[],
  ): GPURenderPipeline {
    return device.createRenderPipeline({
      label: `antique-look-${label}`,
      layout: device.createPipelineLayout({
        label: `antique-look-${label}-layout`,
        bindGroupLayouts: [layout],
      }),
      vertex,
      fragment: {
        module: createShaderModuleWithDevLog(device, code, `antiqueLook.${label}`),
        entryPoint: 'fs',
        targets: formats.map((format) => ({ format })),
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  const paperLayout = layoutOf('paper', ['uniform']);
  const reduceLayout = layoutOf('reduce', ['texture', 'texture']);
  const peaksLayout = layoutOf('peaks', ['texture']);
  const glowLayout = layoutOf('glow', ['texture']);
  const plateLayout = layoutOf('plate', [
    'texture', // print
    'texture', // overlay
    'texture', // foreground:0
    'uniform',
    'texture', // paper
    'texture', // wash
    'texture', // stars
    'sampler',
    'texture', // glow
    'uniform', // ornaments
    'texture', // ornament atlas
  ]);
  const paperPipeline = pipelineOf('paper', paperCode, paperLayout, ['rgba8unorm']);
  const reducePipeline = pipelineOf('reduce', reduceCode, reduceLayout, [
    HDR_TARGET_FORMAT,
    HDR_TARGET_FORMAT,
  ]);
  const peaksPipeline = pipelineOf('peaks', peaksCode, peaksLayout, [HDR_TARGET_FORMAT]);
  const glowPipeline = pipelineOf('glow', glowCode, glowLayout, [HDR_TARGET_FORMAT]);
  const platePipeline = pipelineOf('plate', plateCode, plateLayout, [targetFormat]);

  const uniformBuffer = device.createBuffer({
    label: 'antique-look-uniforms',
    size: ANTIQUE_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformBytes = new ArrayBuffer(ANTIQUE_UNIFORM_BYTES);
  const sampler = device.createSampler({
    label: 'antique-look-linear',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  // All zeros: bound in place of a missing overlay or an undrawn foreground:0.
  const emptyTexture = device.createTexture({
    label: 'antique-look-empty',
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING,
  });
  const emptyView = emptyTexture.createView();
  // The sheet is screen-locked, so it is re-baked only when its row is reallocated.
  let bakedPaper: GPUTextureView | null = null;
  const ornamentBuffer = device.createBuffer({
    label: 'antique-look-ornaments',
    size: ANTIQUE_ORNAMENT_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const ornamentBytes = new ArrayBuffer(ANTIQUE_ORNAMENT_BYTES);
  // Fetched on the look's first frame, not at boot: most sessions never open it.
  // Until it lands (or if it fails) the plate draws with no ornaments.
  let ornamentAtlas: GPUTexture | null = null;
  let ornamentRequested = false;

  function requestOrnamentAtlas(wake: () => void): void {
    ornamentRequested = true;
    fetchAntiqueBitmap('ornaments.png')
      .then((bitmap) => {
        const texture = device.createTexture({
          label: 'antique-look-ornament-atlas',
          size: [bitmap.width, bitmap.height],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
          bitmap.width,
          bitmap.height,
        ]);
        bitmap.close();
        ornamentAtlas = texture;
        // The loop may be asleep at rest; the atlas landing is a reason to draw.
        wake();
      })
      .catch((error: unknown) => console.warn('antique look: ornaments unavailable', error));
  }

  function fullScreen(
    encoder: GPUCommandEncoder,
    label: string,
    targets: readonly GPUTextureView[],
    pipeline: GPURenderPipeline,
    layout: GPUBindGroupLayout,
    resources: readonly GPUBindingResource[],
    timestamps: { timestampWrites?: GPURenderPassTimestampWrites } = {},
  ): void {
    const pass = encoder.beginRenderPass({
      label: `antique-look-${label}`,
      colorAttachments: targets.map((view) => ({ view, loadOp: 'clear', storeOp: 'store' })),
      ...timestamps,
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({
        label: `antique-look-${label}-bg`,
        layout,
        entries: resources.map((resource, binding) => ({ binding, resource })),
      }),
    );
    pass.draw(3);
    pass.end();
  }

  function encode(
    encoder: GPUCommandEncoder,
    ctx: FrameView,
    state: EngineState,
    io: { print: GPUTextureView; overlay: GPUTextureView | null; swap: GPUTextureView },
    timing: GpuTimingService,
  ): void {
    const targets = ctx.snapshot.renderTargets;
    const size = ctx.canvasSize;
    const unitPx = size.height / ANTIQUE_REFERENCE_HEIGHT_CSS;
    const basis = viewBasis(ctx.cam);
    packAntiqueUniforms(
      {
        size,
        unitPx,
        bodies: ctx.snapshot.renderedTargets.has('foreground:0'),
        captions: io.overlay !== null,
        rays: viewCornerRays(basis, ctx.frustum),
        seed: PAPER_SEED,
      },
      uniformBytes,
    );
    device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);
    if (!ornamentRequested) requestOrnamentAtlas(() => state.subsystems.scheduler.requestRender());
    const placed =
      ornamentAtlas === null
        ? []
        : placeAntiqueOrnaments({
            ornaments: ANTIQUE_ORNAMENTS,
            atlas: ANTIQUE_ORNAMENT_ATLAS,
            basis,
            frustum: ctx.frustum,
            size,
            unitPx,
            camDistMpc: Math.hypot(...ctx.drawCamPos),
          });
    device.queue.writeBuffer(ornamentBuffer, 0, packAntiqueOrnaments(placed, ornamentBytes));
    const uniforms = { buffer: uniformBuffer };
    const paper = targets.viewOf(ANTIQUE_TARGETS.paper);
    const wash = targets.viewOf(ANTIQUE_TARGETS.wash);
    const peaks = targets.viewOf(ANTIQUE_TARGETS.peaks);
    const stars = targets.viewOf(ANTIQUE_TARGETS.stars);
    const glow = targets.viewOf(ANTIQUE_TARGETS.glow);
    // foreground:0 keeps last frame's bodies when nothing drew one this frame.
    const hasBodies = ctx.snapshot.renderedTargets.has('foreground:0');
    const bodies = hasBodies ? targets.viewOf('foreground:0') : emptyView;

    if (paper !== bakedPaper) {
      fullScreen(encoder, 'paper', [paper], paperPipeline, paperLayout, [uniforms]);
      bakedPaper = paper;
    }
    fullScreen(encoder, 'reduce', [wash, peaks], reducePipeline, reduceLayout, [io.print, bodies]);
    fullScreen(encoder, 'glow', [glow], glowPipeline, glowLayout, [wash]);
    fullScreen(encoder, 'peaks', [stars], peaksPipeline, peaksLayout, [peaks]);
    fullScreen(
      encoder,
      'plate',
      [io.swap],
      platePipeline,
      plateLayout,
      [
        io.print,
        io.overlay ?? emptyView,
        bodies,
        uniforms,
        paper,
        wash,
        stars,
        sampler,
        glow,
        { buffer: ornamentBuffer },
        ornamentAtlas?.createView() ?? emptyView,
      ],
      timestampSpread(timing, 'stylize'),
    );
  }

  function destroy(): void {
    uniformBuffer.destroy();
    ornamentBuffer.destroy();
    ornamentAtlas?.destroy();
    emptyTexture.destroy();
  }

  const look: AntiqueLook = { label: 'antiqueLook', encode, destroy };
  look satisfies Renderer;
  return look;
}
