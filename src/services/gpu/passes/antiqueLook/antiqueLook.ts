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
  ANTIQUE_GLYPH_BYTES,
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
import { buildAntiqueGlyphSheet } from '../../../../utils/gpu/antiqueLook/buildAntiqueGlyphSheet';
import { placeAntiqueNumerals } from '../../../../utils/gpu/antiqueLook/placeAntiqueNumerals';
import { packAntiqueGlyphs } from '../../../../utils/gpu/antiqueLook/packAntiqueGlyphs';
import { viewBasis } from '../../../../utils/camera/projection/viewBasis';
import { viewCornerRays } from '../../../../utils/camera/projection/viewCornerRays';
import { timestampSpread } from '../../../../utils/gpu/timestampSpread';
import type { AntiqueLook } from '../../../../@types/rendering/AntiqueLook';
import type { AntiqueGlyphSheet } from '../../../../@types/rendering/AntiqueGlyphSheet';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { GpuTimingService } from '../../../../@types/gpu/timing/GpuTimingService';
import type { Renderer } from '../../../../@types/rendering/Renderer';

/** A fixed seed keeps the sheet identical across reloads: a print does not change. */
const PAPER_SEED = 17.0;

const TEXTURE = { texture: { sampleType: 'float' } } as const;
const UNIFORM = { buffer: { type: 'uniform' } } as const;
const SAMPLER = { sampler: { type: 'filtering' } } as const;

export function createAntiqueLook(init: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
}): AntiqueLook {
  const { device, targetFormat } = init;
  const vertex = {
    module: createShaderModuleWithDevLog(device, vsCode, 'antiqueLook.vertex'),
    entryPoint: 'vs',
  };

  function layoutOf(
    label: string,
    bindings: readonly Omit<GPUBindGroupLayoutEntry, 'binding' | 'visibility'>[],
  ): GPUBindGroupLayout {
    return device.createBindGroupLayout({
      label: `antique-look-${label}-bgl`,
      entries: bindings.map((entry, binding) => ({
        ...entry,
        binding,
        visibility: GPUShaderStage.FRAGMENT,
      })),
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

  const paperLayout = layoutOf('paper', [UNIFORM, TEXTURE, TEXTURE, SAMPLER]);
  const reduceLayout = layoutOf('reduce', [TEXTURE, TEXTURE]);
  const peaksLayout = layoutOf('peaks', [TEXTURE, UNIFORM]);
  const glowLayout = layoutOf('glow', [TEXTURE]);
  const plateLayout = layoutOf('plate', [
    TEXTURE, // print
    TEXTURE, // overlay
    TEXTURE, // foreground:0
    UNIFORM,
    TEXTURE, // paper
    TEXTURE, // wash
    TEXTURE, // stars
    SAMPLER,
    TEXTURE, // glow
    UNIFORM, // ornaments
    TEXTURE, // ornament atlas
    UNIFORM, // border digits
    TEXTURE, // glyph sheet
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
  const repeatSampler = device.createSampler({
    label: 'antique-look-repeat',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
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
  let sheetAssetsRequested = false;
  let paperAssets: { tile: GPUTexture; stains: GPUTexture } | null = null;

  const glyphBuffer = device.createBuffer({
    label: 'antique-look-glyphs',
    size: ANTIQUE_GLYPH_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const glyphBytes = new ArrayBuffer(ANTIQUE_GLYPH_BYTES);
  let glyphSheet: { texture: GPUTexture; sheet: AntiqueGlyphSheet } | null = null;

  function uploadBitmap(label: string, bitmap: ImageBitmap): GPUTexture {
    const texture = device.createTexture({
      label,
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
    return texture;
  }

  function requestSheetAssets(wake: () => void): void {
    sheetAssetsRequested = true;
    Promise.all([fetchAntiqueBitmap('paper.webp'), fetchAntiqueBitmap('stains.webp')])
      .then(([tile, stains]) => {
        paperAssets = {
          tile: uploadBitmap('antique-look-paper-tile', tile),
          stains: uploadBitmap('antique-look-stains', stains),
        };
        tile.close();
        stains.close();
        // A new sheet: the next frame re-bakes it.
        bakedPaper = null;
        wake();
      })
      .catch((error: unknown) => console.warn('antique look: scanned paper unavailable', error));
    buildAntiqueGlyphSheet()
      .then((sheet) => {
        glyphSheet = { texture: uploadBitmap('antique-look-glyph-sheet', sheet.bitmap), sheet };
        sheet.bitmap.close();
        wake();
      })
      .catch((error: unknown) => console.warn('antique look: border numbering unavailable', error));
    requestOrnamentAtlas(wake);
  }

  function requestOrnamentAtlas(wake: () => void): void {
    fetchAntiqueBitmap('ornaments.png')
      .then((bitmap) => {
        ornamentAtlas = uploadBitmap('antique-look-ornament-atlas', bitmap);
        bitmap.close();
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
        paper: paperAssets !== null,
        rays: viewCornerRays(basis, ctx.frustum),
        seed: PAPER_SEED,
      },
      uniformBytes,
    );
    device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);
    if (!sheetAssetsRequested) requestSheetAssets(() => state.subsystems.scheduler.requestRender());
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
    const digits =
      glyphSheet === null
        ? []
        : placeAntiqueNumerals({
            basis,
            frustum: ctx.frustum,
            size,
            unitPx,
            sheet: glyphSheet.sheet,
          });
    device.queue.writeBuffer(glyphBuffer, 0, packAntiqueGlyphs(digits, glyphBytes));
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
      fullScreen(encoder, 'paper', [paper], paperPipeline, paperLayout, [
        uniforms,
        paperAssets?.tile.createView() ?? emptyView,
        paperAssets?.stains.createView() ?? emptyView,
        repeatSampler,
      ]);
      bakedPaper = paper;
    }
    fullScreen(encoder, 'reduce', [wash, peaks], reducePipeline, reduceLayout, [io.print, bodies]);
    fullScreen(encoder, 'glow', [glow], glowPipeline, glowLayout, [wash]);
    fullScreen(encoder, 'peaks', [stars], peaksPipeline, peaksLayout, [peaks, uniforms]);
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
        { buffer: glyphBuffer },
        glyphSheet?.texture.createView() ?? emptyView,
      ],
      timestampSpread(timing, 'stylize'),
    );
  }

  function destroy(): void {
    uniformBuffer.destroy();
    ornamentBuffer.destroy();
    ornamentAtlas?.destroy();
    glyphBuffer.destroy();
    paperAssets?.tile.destroy();
    paperAssets?.stains.destroy();
    glyphSheet?.texture.destroy();
    emptyTexture.destroy();
  }

  const look: AntiqueLook = { label: 'antiqueLook', encode, destroy };
  look satisfies Renderer;
  return look;
}
