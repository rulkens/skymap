/**
 * antiqueLook — the `stylize` step: four full-screen passes, in order.
 *   1. paper  — the sheet, baked only when its row was (re)allocated or the
 *               scanned paper landed;
 *   2. reduce — print → quarter-res `wash` (low band) + `peaks` (MRT);
 *   3. glow   — `wash` → 1/16-res `glow`, the low band past star scale;
 *   4. peaks  — non-maximum suppression → `stars`;
 *   5. glyphs — one instanced quad per star cell, scattered into `star-ink`;
 *      decor  — one instanced quad per placed ornament, into `decor`/`decor-hue`;
 *   6. plate  — everything inked onto the swap chain.
 * Everything GPU-side is built on the look's first frame, not at boot: most
 * sessions never open it. The look itself lives in `shaders/antiqueLook/`.
 */

import { createAntiqueLookGpu } from './createAntiqueLookGpu';
import { loadAntiqueSheetAssets } from './loadAntiqueSheetAssets';
import {
  ANTIQUE_CELL,
  ANTIQUE_GLYPH_BYTES,
  ANTIQUE_ORNAMENT_BYTES,
  ANTIQUE_REFERENCE_HEIGHT_CSS,
  ANTIQUE_TARGETS,
  ANTIQUE_UNIFORM_BYTES,
} from '../../../../data/rendering/antiqueLook';
import { ANTIQUE_ORNAMENTS } from '../../../../data/rendering/antiqueOrnaments';
import { ANTIQUE_ORNAMENT_ATLAS } from '../../../../data/rendering/antiqueOrnamentAtlas';
import { packAntiqueUniforms } from '../../../../utils/gpu/antiqueLook/packAntiqueUniforms';
import { packAntiqueOrnaments } from '../../../../utils/gpu/antiqueLook/packAntiqueOrnaments';
import { packAntiqueGlyphs } from '../../../../utils/gpu/antiqueLook/packAntiqueGlyphs';
import { placeAntiqueOrnaments } from '../../../../utils/gpu/antiqueLook/placeAntiqueOrnaments';
import { placeAntiqueNumerals } from '../../../../utils/gpu/antiqueLook/placeAntiqueNumerals';
import { antiqueGraticuleSteps } from '../../../../utils/gpu/antiqueLook/antiqueGraticuleSteps';
import { terminatorHatchAngle } from '../../../../utils/gpu/antiqueLook/terminatorHatchAngle';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';
import { viewBasis } from '../../../../utils/camera/projection/viewBasis';
import { viewCornerRays } from '../../../../utils/camera/projection/viewCornerRays';
import { timestampSpread } from '../../../../utils/gpu/timestampSpread';
import type { AntiqueLook } from '../../../../@types/rendering/AntiqueLook';
import type { AntiqueLookGpu } from '../../../../@types/rendering/AntiqueLookGpu';
import type { AntiqueSheetAssets } from '../../../../@types/rendering/AntiqueSheetAssets';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { GpuTimingService } from '../../../../@types/gpu/timing/GpuTimingService';
import type { Renderer } from '../../../../@types/rendering/Renderer';

/** The terminator is read off the Sun's pose relative to the eye. */
const SUN = asSceneBodyId('sun');

/** A fixed seed keeps the sheet identical across reloads: a print does not change. */
const PAPER_SEED = 17.0;

export function createAntiqueLook(init: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
}): AntiqueLook {
  const { device, targetFormat } = init;
  let gpu: AntiqueLookGpu | null = null;
  let assets: AntiqueSheetAssets | null = null;
  // The sheet is screen-locked: re-baked only when its row is reallocated or new paper lands.
  let bakedPaper: GPUTextureView | null = null;
  const uniformBytes = new ArrayBuffer(ANTIQUE_UNIFORM_BYTES);
  const ornamentBytes = new ArrayBuffer(ANTIQUE_ORNAMENT_BYTES);
  const glyphBytes = new ArrayBuffer(ANTIQUE_GLYPH_BYTES);

  function fullScreen(
    encoder: GPUCommandEncoder,
    label: string,
    targets: readonly GPUTextureView[],
    stage: { pipeline: GPURenderPipeline; layout: GPUBindGroupLayout },
    resources: readonly GPUBindingResource[],
    timestamps: { timestampWrites?: GPURenderPassTimestampWrites } = {},
  ): void {
    const pass = encoder.beginRenderPass({
      label: `antique-look-${label}`,
      colorAttachments: targets.map((view) => ({ view, loadOp: 'clear', storeOp: 'store' })),
      ...timestamps,
    });
    pass.setPipeline(stage.pipeline);
    // Rebuilt per encode: every source view is recreated on resize.
    pass.setBindGroup(
      0,
      device.createBindGroup({
        label: `antique-look-${label}-bg`,
        layout: stage.layout,
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
    gpu ??= createAntiqueLookGpu(device, targetFormat);
    assets ??= loadAntiqueSheetAssets(device, (asset) => {
      if (asset === 'paper') bakedPaper = null;
      state.subsystems.scheduler.requestRender();
    });
    const g = gpu;
    const targets = ctx.snapshot.renderTargets;
    const size = ctx.canvasSize;
    const unitPx = size.height / ANTIQUE_REFERENCE_HEIGHT_CSS;
    const basis = viewBasis(ctx.cam);
    const rulings = antiqueGraticuleSteps(basis, ctx.frustum, size, unitPx);
    const hasBodies = ctx.snapshot.renderedTargets.has('foreground:0');
    const { paper: paperAssets, ornaments: atlas, glyphs } = assets;

    packAntiqueUniforms(
      {
        size,
        unitPx,
        bodies: hasBodies,
        captions: io.overlay !== null,
        paper: paperAssets !== null,
        rays: viewCornerRays(basis, ctx.frustum),
        seed: PAPER_SEED,
        rulings,
        hatchAngle: terminatorHatchAngle(ctx.bodyPose(SUN)),
      },
      uniformBytes,
    );
    device.queue.writeBuffer(g.uniforms, 0, uniformBytes);
    const placed =
      atlas === null
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
    device.queue.writeBuffer(g.ornaments, 0, packAntiqueOrnaments(placed, ornamentBytes));
    const digits =
      glyphs === null
        ? []
        : placeAntiqueNumerals({
            basis,
            frustum: ctx.frustum,
            size,
            unitPx,
            rulings,
            sheet: glyphs.sheet,
          });
    device.queue.writeBuffer(g.digits, 0, packAntiqueGlyphs(digits, glyphBytes));

    const uniforms = { buffer: g.uniforms };
    const paper = targets.viewOf(ANTIQUE_TARGETS.paper);
    const wash = targets.viewOf(ANTIQUE_TARGETS.wash);
    const peaks = targets.viewOf(ANTIQUE_TARGETS.peaks);
    const stars = targets.viewOf(ANTIQUE_TARGETS.stars);
    const glow = targets.viewOf(ANTIQUE_TARGETS.glow);
    const starInk = targets.viewOf(ANTIQUE_TARGETS.starInk);
    const decor = targets.viewOf(ANTIQUE_TARGETS.decor);
    const decorHue = targets.viewOf(ANTIQUE_TARGETS.decorHue);
    // foreground:0 keeps last frame's bodies when nothing drew one this frame.
    const bodies = hasBodies ? targets.viewOf('foreground:0') : g.empty;

    if (paper !== bakedPaper) {
      fullScreen(encoder, 'paper', [paper], g.paper, [
        uniforms,
        paperAssets?.tile.createView() ?? g.empty,
        paperAssets?.stains.createView() ?? g.empty,
        g.repeatSampler,
      ]);
      bakedPaper = paper;
    }
    fullScreen(encoder, 'reduce', [wash, peaks], g.reduce, [io.print, bodies]);
    fullScreen(encoder, 'glow', [glow], g.glow, [wash]);
    fullScreen(encoder, 'peaks', [stars], g.peaks, [peaks, uniforms]);
    // One instance per quarter-res cell (an upper bound: the shader drops the rest).
    const cells = Math.ceil(size.width / ANTIQUE_CELL) * Math.ceil(size.height / ANTIQUE_CELL);
    const glyphPass = encoder.beginRenderPass({
      label: 'antique-look-glyphs',
      colorAttachments: [{ view: starInk, loadOp: 'clear', storeOp: 'store' }],
    });
    glyphPass.setPipeline(g.glyphs.pipeline);
    glyphPass.setBindGroup(
      0,
      device.createBindGroup({
        label: 'antique-look-glyphs-bg',
        layout: g.glyphs.layout,
        entries: [
          { binding: 0, resource: stars },
          { binding: 1, resource: uniforms },
        ],
      }),
    );
    glyphPass.draw(4, cells);
    glyphPass.end();
    const decorPass = encoder.beginRenderPass({
      label: 'antique-look-decor',
      colorAttachments: [decor, decorHue].map((view) => ({
        view,
        loadOp: 'clear',
        storeOp: 'store',
      })),
    });
    if (placed.length > 0 && atlas !== null) {
      decorPass.setPipeline(g.decor.pipeline);
      decorPass.setBindGroup(
        0,
        device.createBindGroup({
          label: 'antique-look-decor-bg',
          layout: g.decor.layout,
          entries: [
            { binding: 0, resource: uniforms },
            { binding: 1, resource: { buffer: g.ornaments } },
            { binding: 2, resource: atlas.createView() },
            { binding: 3, resource: g.clampSampler },
          ],
        }),
      );
      decorPass.draw(4, placed.length);
    }
    decorPass.end();
    fullScreen(
      encoder,
      'plate',
      [io.swap],
      g.plate,
      [
        io.print,
        io.overlay ?? g.empty,
        bodies,
        uniforms,
        paper,
        wash,
        starInk,
        g.clampSampler,
        glow,
        decor,
        decorHue,
        { buffer: g.digits },
        glyphs?.texture.createView() ?? g.empty,
      ],
      timestampSpread(timing, 'stylize'),
    );
  }

  function destroy(): void {
    gpu?.destroy();
    assets?.destroy();
  }

  const look: AntiqueLook = { label: 'antiqueLook', encode, destroy };
  look satisfies Renderer;
  return look;
}
