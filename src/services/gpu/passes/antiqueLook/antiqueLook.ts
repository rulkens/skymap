/**
 * antiqueLook — the `stylize` step, its passes in order: paper (the sheet, baked
 * only when its row was reallocated or the scan landed), reduce (print →
 * quarter-res `wash`), glow (`wash` → 1/16-res), nebula (`wash` → the galaxy
 * engraving's quarter-res fields), sky floor (glow → one f32, compute), land blur (`wash.a` →
 * `land-blur`, across then down, only under a land map), glyphs (from the
 * star Layer's `print-points`) and decor (instanced scatters into `star-ink` and
 * `decor`/`decor-hue`), plate (all of it inked onto the swap chain). One
 * `stylize` timing slot spans them, as `runBloom`'s does. GPU objects are built
 * on the look's first frame, not at boot: most sessions never open it.
 */

import { createAntiqueLookGpu } from './createAntiqueLookGpu';
import { loadAntiqueSheetAssets } from './loadAntiqueSheetAssets';
import {
  ANTIQUE_GLYPH_BYTES,
  ANTIQUE_ORNAMENT_BYTES,
  ANTIQUE_REFERENCE_HEIGHT_CSS,
  ANTIQUE_TARGETS,
  ANTIQUE_UNIFORM_BYTES,
} from '../../../../data/rendering/antiqueLook';
import { ANTIQUE_PLATE_BODIES_BYTES } from '../../../../data/rendering/antiquePlateBodies';
import { ANTIQUE_ORNAMENTS } from '../../../../data/rendering/antiqueOrnaments';
import { ANTIQUE_ORNAMENT_ATLAS } from '../../../../data/rendering/antiqueOrnamentAtlas';
import { packAntiqueUniforms } from '../../../../utils/gpu/antiqueLook/packAntiqueUniforms';
import { packAntiquePlateBodies } from '../../../../utils/gpu/antiqueLook/packAntiquePlateBodies';
import { antiquePlateBodies } from './antiquePlateBodies';
import { packAntiqueOrnaments } from '../../../../utils/gpu/antiqueLook/packAntiqueOrnaments';
import { packAntiqueGlyphs } from '../../../../utils/gpu/antiqueLook/packAntiqueGlyphs';
import { placeAntiqueOrnaments } from '../../../../utils/gpu/antiqueLook/placeAntiqueOrnaments';
import { placeAntiqueNumerals } from '../../../../utils/gpu/antiqueLook/placeAntiqueNumerals';
import { antiqueGraticuleSteps } from '../../../../utils/gpu/antiqueLook/antiqueGraticuleSteps';
import { terminatorHatchAngle } from '../../../../utils/gpu/antiqueLook/terminatorHatchAngle';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';
import { bodyRowSlabs } from '../../../engine/frame/bodyRowSlabs';
import { viewBasis } from '../../../../utils/camera/projection/viewBasis';
import { viewCornerRays } from '../../../../utils/camera/projection/viewCornerRays';
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
  const plateBodyBytes = new ArrayBuffer(ANTIQUE_PLATE_BODIES_BYTES);

  function fullScreen(
    encoder: GPUCommandEncoder,
    label: string,
    targets: readonly GPUTextureView[],
    stage: { pipeline: GPURenderPipeline; layout: GPUBindGroupLayout },
    resources: readonly GPUBindingResource[],
    timestampWrites?: GPURenderPassTimestampWrites,
  ): void {
    const pass = encoder.beginRenderPass({
      label: `antique-look-${label}`,
      colorAttachments: targets.map((view) => ({ view, loadOp: 'clear', storeOp: 'store' })),
      ...(timestampWrites ? { timestampWrites } : {}),
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
    // Inside an atmosphere the day sky fills foreground:0's alpha; its depth tells body from sky.
    const depthCover = hasBodies && bodyRowSlabs(ctx).insideAtmosphere.length > 0;
    const { paper: paperAssets, ornaments: atlas, glyphs } = assets;

    packAntiqueUniforms(
      {
        size,
        unitPx,
        bodies: hasBodies,
        depthCover,
        captions: io.overlay !== null,
        paper: paperAssets !== null,
        rays: viewCornerRays(basis, ctx.frustum, size),
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
            camPosMpc: ctx.drawCamPos,
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
    const landMapped = ctx.snapshot.renderedTargets.has(ANTIQUE_TARGETS.land);
    const plateBodies = hasBodies ? antiquePlateBodies(state, ctx, unitPx, landMapped) : [];
    device.queue.writeBuffer(g.plateBodies, 0, packAntiquePlateBodies(plateBodies, plateBodyBytes));

    const uniforms = { buffer: g.uniforms };
    const paper = targets.viewOf(ANTIQUE_TARGETS.paper);
    const wash = targets.viewOf(ANTIQUE_TARGETS.wash);
    const glow = targets.viewOf(ANTIQUE_TARGETS.glow);
    const nebula = targets.viewOf(ANTIQUE_TARGETS.nebula);
    // The structure markers, when one drew this frame: their own low band, else nothing.
    const structured = ctx.snapshot.renderedTargets.has(ANTIQUE_TARGETS.structures);
    const structureGlow = structured ? targets.viewOf(ANTIQUE_TARGETS.structureGlow) : g.empty;
    const starInk = targets.viewOf(ANTIQUE_TARGETS.starInk);
    const decor = targets.viewOf(ANTIQUE_TARGETS.decor);
    const decorHue = targets.viewOf(ANTIQUE_TARGETS.decorHue);
    // foreground:0 keeps last frame's bodies when nothing drew one this frame.
    const bodies = !hasBodies
      ? g.empty
      : depthCover
        ? targets.depthViewOf('foreground:0')
        : targets.viewOf('foreground:0');
    // The land map, when a masked globe drew this frame (Earth, Mars).
    const land = landMapped ? targets.viewOf(ANTIQUE_TARGETS.land) : g.empty;
    const landBlurAcross = targets.viewOf(ANTIQUE_TARGETS.landBlurAcross);
    const landBlur = targets.viewOf(ANTIQUE_TARGETS.landBlur);
    // The catalogue's naked-eye stars, when a star pass printed this frame.
    const printed = ctx.snapshot.renderedTargets.has(ANTIQUE_TARGETS.printPoints);
    const points = printed ? targets.viewOf(ANTIQUE_TARGETS.printPoints) : g.empty;
    const lines = ctx.snapshot.renderedTargets.has(ANTIQUE_TARGETS.lines)
      ? targets.viewOf(ANTIQUE_TARGETS.lines)
      : g.empty;
    // The slot's begin rides whichever pass opens first (the paper bake is
    // usually skipped), its end the plate; both write the one query pair.
    const ts = timing.descriptorFor('stylize');
    const begin = ts && {
      querySet: ts.querySet,
      beginningOfPassWriteIndex: ts.beginningOfPassWriteIndex,
    };
    const end = ts && { querySet: ts.querySet, endOfPassWriteIndex: ts.endOfPassWriteIndex };

    const bakesPaper = paper !== bakedPaper;
    if (bakesPaper) {
      fullScreen(
        encoder,
        'paper',
        [paper],
        g.paper,
        [uniforms, paperAssets?.tile ?? g.empty, paperAssets?.stains ?? g.empty, g.repeatSampler],
        begin,
      );
      bakedPaper = paper;
    }
    fullScreen(
      encoder,
      'reduce',
      [wash],
      g.reduce,
      [io.print, bodies, land, uniforms],
      bakesPaper ? undefined : begin,
    );
    fullScreen(encoder, 'glow', [glow], g.glow, [wash]);
    fullScreen(encoder, 'nebula', [nebula], g.nebula, [wash, g.clampSampler]);
    if (structured) {
      fullScreen(encoder, 'structure-glow', [structureGlow], g.structureGlow, [
        targets.viewOf(ANTIQUE_TARGETS.structures),
        g.clampSampler,
      ]);
    }
    const floorPass = encoder.beginComputePass({ label: 'antique-look-sky-floor' });
    floorPass.setPipeline(g.skyFloor.pipeline);
    floorPass.setBindGroup(
      0,
      device.createBindGroup({
        label: 'antique-look-sky-floor-bg',
        layout: g.skyFloor.layout,
        entries: [
          { binding: 0, resource: glow },
          { binding: 1, resource: { buffer: g.skyFloorBuffer } },
        ],
      }),
    );
    floorPass.dispatchWorkgroups(1);
    floorPass.end();
    // Only mapped land is read (a record's land flag), so no map, no blur.
    if (landMapped) {
      fullScreen(encoder, 'land-blur-across', [landBlurAcross], g.landBlurAcross, [wash, uniforms]);
      fullScreen(encoder, 'land-blur-down', [landBlur], g.landBlurDown, [landBlurAcross, uniforms]);
    }
    // One instance per print-points texel; the shader drops those holding no star.
    const cells = printed ? targets.sizeOf(ANTIQUE_TARGETS.printPoints) : { width: 1, height: 1 };
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
          { binding: 0, resource: points },
          { binding: 1, resource: uniforms },
          { binding: 2, resource: bodies },
        ],
      }),
    );
    glyphPass.draw(4, cells.width * cells.height);
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
            { binding: 2, resource: atlas },
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
        glyphs?.view ?? g.empty,
        lines,
        { buffer: g.plateBodies },
        landBlur,
        nebula,
        { buffer: g.skyFloorBuffer },
        structureGlow,
      ],
      end,
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
