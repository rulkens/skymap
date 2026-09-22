/**
 * starAggregatesPass — the survey-star AGGREGATE stream into the half-res
 * offscreen. Its walk/partition is `readStarCut`, fed by `computeStarCut`
 * (both tested in `readStarCut.test.ts`); here we pin only that it shares
 * the star gate and records the AGGREGATE sub-stream (never the leaf one)
 * into its pass.
 */

import { describe, it, expect, vi } from 'vitest';

import { starAggregatesPass } from '../../../../src/layers/starCatalog/passes/starAggregatesPass';
import { starCatalogPass } from '../../../../src/layers/starCatalog/passes/starCatalogPass';
import { computeStarCut } from '../../../../src/layers/starCatalog/render/cut/computeStarCut';
import { advanceStarFades } from '../../../../src/layers/starCatalog/render/cut/advanceStarFades';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { Source } from '../../../../src/data/source';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogDrawArgs } from '../../../../src/@types/rendering/starCatalogRenderer/StarCatalogDrawArgs';
import type { StarCatalogSettings } from '../../../../src/@types/settings/StarCatalogSettings';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;
const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// Root aggregate 10 kpc out, coarsened when the camera sits to the side.
const FAR_PC: Vec3 = [10_000, 5_000, 0];

function camAtPcVec(pc: Readonly<Vec3>): Vec3 {
  return [pc[0] * PC_TO_MPC, pc[1] * PC_TO_MPC, pc[2] * PC_TO_MPC];
}

// The layer reads its viewport via `sizeOf('star-aggregates')` — the fixture
// hardcodes the size the production table's scale: 2 implies for the 1280x720
// canvas below (floor(1280 / 2), floor(720 / 2)). During a capture draw
// (`viewKind: 'capture'`) the ctx IS the synthetic face camera
// `deriveView(faceViewSpec(...))` builds, whose `canvasSize` is the row's 256 px face; `sizeOf` has no row for
// it, so a layer that reached for the capture target instead would throw here.
function makeCtx(camPos: Readonly<Vec3>, nowMs = 0, capture = false): FrameView {
  const renderTargets = {
    specs: [{ id: 'star-aggregates', scale: 2 }],
    sizeOf: (id: string) => {
      if (id === 'star-aggregates') return { width: 640, height: 360 };
      throw new Error(`fixture renderTargets: no size for '${id}'`);
    },
  };
  return {
    // Frame-owned (`ReadyFrameContext`), nested for `computeStarCut` and
    // `starAggregatesPass.ts`'s `ctx.snapshot.renderTargets` read.
    snapshot: { nowMs, renderTargets },
    drawCamPos: camPos,
    viewSlot: capture ? 1 : 0,
    viewKind: capture ? 'capture' : 'frame',
    canvasSize: capture ? { width: 256, height: 256 } : { width: 1280, height: 720 },
  } as unknown as FrameView;
}

/** A dense level-0 leaf (3 stars) under a level-1 aggregate root. */
function makeAggregateCatalog(): StarCatalog {
  return {
    starCount: 3,
    nodeCount: 2,
    mortonBitsPerAxis: 9,
    cellEdgePc: 78,
    gridOrigin: [10_000, 0, 0],
    nodes: [
      { mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 3 },
      { mortonIndex: 0, level: 1, childMask: 0b1, firstRecord: 3, recordCount: 1 },
    ],
    records: new Uint8Array(4 * 6),
  };
}

/** A spy renderer whose `setFrameCut`/`getFrameCut` are a real in-memory pair —
 *  `starCutFor` reads the frame cut off exactly these for a non-capture ctx. */
function makeRuntime(loaded: readonly { source: number; catalog: StarCatalog }[]): {
  runtime: StarCatalogRuntime;
  draw: ReturnType<typeof vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs) => void>>;
  setFrameCut: (cut: unknown) => void;
} {
  let frameCut: unknown = null;
  const draw = vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs) => void>();
  const renderer = {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw,
    setFrameCut: vi.fn((cut: unknown) => {
      frameCut = cut;
    }),
    getFrameCut: vi.fn(() => frameCut),
  };
  return {
    runtime: { renderer } as unknown as StarCatalogRuntime,
    draw,
    setFrameCut: renderer.setFrameCut,
  };
}

/** Mirrors the Layer's `frame` hook's `advanceStarFades` → `computeStarCut` →
 *  `setFrameCut` sequence for a non-capture ctx, so `starCutFor` has a frame
 *  cut to read. */
function primeFrameCut(
  runtime: StarCatalogRuntime,
  settings: StarCatalogSettings,
  ctx: FrameView,
): void {
  advanceStarFades(runtime, settings, [ctx]);
  const cut = computeStarCut(runtime, settings, [ctx]);
  runtime.renderer.setFrameCut(cut);
}

function makeSettings(): StarCatalogSettings {
  return {
    enabled: true,
    sizePx: 2.5,
    brightness: 1.0,
    refineThreshold: 0.05,
    glowOverlap: 1.0,
    aggregateIntensityCap: 0.06,
    items: { gaiaStars: { enabled: true, labelEnabled: false } },
  } as unknown as StarCatalogSettings;
}

function makePassState(settings: StarCatalogSettings): PassState {
  return { settings: { starCatalogs: settings } } as unknown as PassState;
}

function makeNear0View(camPos: Vec3): SlabView {
  const slab: Slab = makeSlab();
  return { slab, vp: new Float32Array(16), camPos, viewportPx: [1280, 720] };
}

describe('starAggregatesPass', () => {
  it('shares the star visibility gate (same enabled outcome as star-catalog)', () => {
    const { runtime } = makeRuntime([
      { source: Source.GaiaStars, catalog: makeAggregateCatalog() },
    ]);
    const aggregatesPass = starAggregatesPass(runtime);
    const catalogPass = starCatalogPass(runtime);
    const state = makePassState(makeSettings());
    const insideCtx = makeCtx(camAtPcVec(FAR_PC));
    const view = makeNear0View(camAtPcVec(FAR_PC));
    expect(aggregatesPass.enabled(state, insideCtx, view)).toBe(
      catalogPass.enabled(state, insideCtx, view),
    );
  });

  it('records the AGGREGATE stream (stream tag, isAggregate all 1) into its pass', () => {
    const { runtime, draw } = makeRuntime([
      { source: Source.GaiaStars, catalog: makeAggregateCatalog() },
    ]);
    const pass = starAggregatesPass(runtime);
    const camPos = camAtPcVec(FAR_PC);
    const settings = makeSettings();
    const ctx = makeCtx(camPos);
    primeFrameCut(runtime, settings, ctx);
    pass.draw!(PASS_STUB, makeNear0View(camPos), ctx, makePassState(settings));

    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]![1];
    expect(args.stream).toBe('aggregate');
    expect(args.drawCount).toBeGreaterThan(0);
    // The flat arrays are reused grow-only buffers, so scan only `[0, drawCount)`.
    expect(args.isAggregate.subarray(0, args.drawCount).every((v) => v === 1)).toBe(true);
  });

  it('sizes sprites against the half-res offscreen, not the canvas', () => {
    const { runtime, draw } = makeRuntime([
      { source: Source.GaiaStars, catalog: makeAggregateCatalog() },
    ]);
    const pass = starAggregatesPass(runtime);
    const camPos = camAtPcVec(FAR_PC);
    const view = makeNear0View(camPos);
    const settings = makeSettings();
    const ctx = makeCtx(camPos);
    primeFrameCut(runtime, settings, ctx);
    pass.draw!(PASS_STUB, view, ctx, makePassState(settings));

    const args = draw.mock.calls[0]![1];
    expect(args.viewportPx).toEqual([640, 360]);
    // The SlabView is one object shared by every layer in the render step;
    // this layer must copy it, not mutate it, or siblings drawing after it
    // would inherit the halved viewport.
    expect(view.viewportPx).toEqual([1280, 720]);
  });

  it('sizes sprites against the capture face during a capture draw (viewKind capture), not star-aggregates', () => {
    const { runtime, draw } = makeRuntime([
      { source: Source.GaiaStars, catalog: makeAggregateCatalog() },
    ]);
    const pass = starAggregatesPass(runtime);
    const camPos = camAtPcVec(FAR_PC);
    const view = makeNear0View(camPos);
    pass.draw!(PASS_STUB, view, makeCtx(camPos, 0, true), makePassState(makeSettings()));

    const args = draw.mock.calls[0]![1];
    expect(args.viewportPx).toEqual([256, 256]);
  });

  // The aggregate glow is kneed by `star-upsample` over the summed half-res
  // field. A capture face has no upsample behind it, so an un-kneed capture
  // would make the lensed sky brighter than the direct view beside it.
  it('draws linear into the offscreen but kneed into a sky-cubemap face', () => {
    const { runtime, draw } = makeRuntime([
      { source: Source.GaiaStars, catalog: makeAggregateCatalog() },
    ]);
    const pass = starAggregatesPass(runtime);
    const camPos = camAtPcVec(FAR_PC);
    const view = makeNear0View(camPos);
    const settings = makeSettings();
    const ctx = makeCtx(camPos);
    primeFrameCut(runtime, settings, ctx);

    pass.draw!(PASS_STUB, view, ctx, makePassState(settings));
    expect(draw.mock.calls[0]![1].knee).toBe(false);

    pass.draw!(PASS_STUB, view, makeCtx(camPos, 0, true), makePassState(settings));
    expect(draw.mock.calls[1]![1].knee).toBe(true);
  });
});
