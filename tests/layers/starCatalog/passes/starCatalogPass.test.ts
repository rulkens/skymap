/**
 * starCatalogPass — the survey (Gaia bin) star LEAF content row. The cut is
 * taken on the GPU; here we pin the layer's own behaviour:
 *
 *   1. `enabled` delegates to `starCatalogVisible` — the toggles AND the
 *      crossfade band that IS the far gate.
 *   2. `draw` records the LEAF stream of the frame cut for every source,
 *      handing the IDENTICAL cut-origin-rebased matrix to each `drawCut`
 *      (the shared-camera-uniform invariant) with the frame's scalars.
 */

import { describe, it, expect, vi } from 'vitest';

import { starCatalogPass } from '../../../../src/layers/starCatalog/passes/starCatalogPass';
import { rebaseViewProj } from '../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../src/utils/math/narrowMat4';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { Source } from '../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../src/layers/starCatalog/sources/gaia-stars';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogCutDrawArgs } from '../../../../src/layers/starCatalog/@types/StarCatalogCutDrawArgs';
import type { StarCutFrame } from '../../../../src/layers/starCatalog/@types/StarCutFrame';
import type { StarCatalogSettings } from '../../../../src/@types/settings/StarCatalogSettings';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const PASS_STUB = {} as unknown as GPURenderPassEncoder;

function camAtPc(distPc: number): Vec3 {
  return [0, 0, distPc * SCALE_UNITS.PC_TO_MPC];
}

function makeCtx(camPos: Readonly<Vec3>): FrameView {
  return {
    snapshot: { nowMs: 0 },
    drawCamPos: camPos,
    viewKind: 'frame',
    viewSlot: 3,
    canvasSize: { width: 1280, height: 720 },
    drawPxPerRad: 623.5,
  } as unknown as FrameView;
}

function makeFrame(originMpc: Vec3): StarCutFrame {
  return {
    originMpc,
    nowMs: 0,
    planes: new Float32Array(24),
    viewCount: 1,
    refineThreshold: 0.05,
    worldSpread: 1,
    leafMarginRad: 0.001,
    sources: [
      { source: Source.GaiaStars, opacity: 1, budgetTypical: 100 },
      { source: Source.GaiaStars, opacity: 1, budgetTypical: 100 },
    ],
    sizePx: 6.25,
    brightness: 2,
    glowOverlap: 2.2,
    aggregateIntensityCap: 0.15,
  };
}

function makeRuntime(frame: StarCutFrame | null) {
  const drawCut = vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogCutDrawArgs) => void>();
  const catalog = { starCount: 1 } as unknown as StarCatalog;
  const renderer = {
    loadedCatalogs: () => [{ source: Source.GaiaStars, catalog }][Symbol.iterator](),
    getFrameCut: () => frame,
    drawCut,
  };
  return { runtime: { renderer } as unknown as StarCatalogRuntime, drawCut };
}

function makeSettings(master = true, item = true): StarCatalogSettings {
  return {
    enabled: master,
    items: { gaiaStars: { enabled: item, labelEnabled: false } },
  } as unknown as StarCatalogSettings;
}

function makePassState(settings: StarCatalogSettings): PassState {
  return { settings: { starCatalogs: settings } } as unknown as PassState;
}

// Distinct f64 slab vp and f32 vp, so identity reveals which one is rebased.
function makeNear0View(camPos: Vec3): SlabView {
  return { slab: makeSlab(), vp: new Float32Array(16), camPos, viewportPx: [1280, 720] };
}

const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;
const VIEW_STUB = makeNear0View([0, 0, 0]);

describe('starCatalogPass.enabled', () => {
  it('follows the master gate, the per-item toggle, and the crossfade band', () => {
    const pass = starCatalogPass(makeRuntime(null).runtime);
    const insideCtx = makeCtx(camAtPc(inner + (outer - inner) * 0.25));
    expect(pass.enabled(makePassState(makeSettings()), insideCtx, VIEW_STUB)).toBe(true);

    const beyondCtx = makeCtx(camAtPc(outer + 1000));
    expect(pass.enabled(makePassState(makeSettings()), beyondCtx, VIEW_STUB)).toBe(false);
    expect(pass.enabled(makePassState(makeSettings(false)), insideCtx, VIEW_STUB)).toBe(false);
    expect(pass.enabled(makePassState(makeSettings(true, false)), insideCtx, VIEW_STUB)).toBe(
      false,
    );
  });
});

describe('starCatalogPass.draw', () => {
  it('draws the LEAF stream per source with the SAME cut-origin-rebased vp and the frame scalars', () => {
    const camPos = camAtPc(1_000);
    const frame = makeFrame([1, 2, 3]);
    const { runtime, drawCut } = makeRuntime(frame);
    const view = makeNear0View(camPos);

    starCatalogPass(runtime).draw!(PASS_STUB, view, makeCtx(camPos), makePassState(makeSettings()));

    expect(drawCut).toHaveBeenCalledTimes(2);
    const [a, b] = drawCut.mock.calls.map((c) => c[1]);
    expect(a!.stream).toBe('leaf');
    expect(a!.knee).toBe(true);
    expect(a!.vp).toBe(b!.vp);
    expect(a!.vp).not.toBe(view.vp);
    expect(a!.vp).toEqual(narrowMat4(rebaseViewProj(view.slab.vp, frame.originMpc)));
    expect(a!.viewSlot).toBe(3);
    expect(a!.sizePx).toBe(6.25);
    expect(a!.brightness).toBe(2);
    expect(a!.glowOverlap).toBe(2.2);
    expect(a!.aggregateIntensityCap).toBe(0.15);
    expect(a!.pxPerRad).toBe(623.5);
  });

  it('draws nothing when the frame has no cut', () => {
    const camPos = camAtPc(1_000);
    const { runtime, drawCut } = makeRuntime(null);
    starCatalogPass(runtime).draw!(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(camPos),
      makePassState(makeSettings()),
    );
    expect(drawCut).not.toHaveBeenCalled();
  });
});
