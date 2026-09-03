/**
 * prepareStarCut — the per-frame star cut that feeds BOTH survey-star streams.
 * It runs the octree walk, advances the per-node LOD fades, and PARTITIONS each
 * drawn node into the leaf stream (childless real-star nodes) or the aggregate
 * stream (interior flux-mip nodes) by `childMask`. These tests pin the two
 * behaviours no compiler check catches:
 *
 *   1. The partition — every drawn node lands in exactly one stream, and the
 *      stream is chosen by `childMask` (0 ⇒ leaf) NOT `level` (a fat leaf sits
 *      at level > 0 yet is a leaf). Each stream's `isAggregate` /
 *      `subtreeStarCount` match its species.
 *   2. The per-node LOD fade — a node fades in over ~250 ms as it enters the
 *      cut and out as it leaves, its opacity the crossfade × its own fade, and
 *      a mid-fade frame reports `anyNodeFading` (the keep-ticking vote runFrame
 *      forwards to `shouldKeepTicking`). The walk runs once per frame (memoised
 *      on ctx).
 */

import { describe, it, expect, vi } from 'vitest';

import {
  prepareStarCut,
  type PreparedStarCut,
  type StarNodeStream,
} from '../../../../../src/services/engine/frame/passes/starCatalogLayer';
import { fadeBand } from '../../../../../src/utils/math/fadeBand';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../../src/data/sources/gaia-stars';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;
const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;

/** A parsec-frame camera position expressed in the scene's Mpc frame. */
function camAtPcVec(pc: Readonly<Vec3>): Vec3 {
  return [pc[0] * PC_TO_MPC, pc[1] * PC_TO_MPC, pc[2] * PC_TO_MPC];
}

/** A camera down +z at the given heliocentric distance, in parsecs. */
function camAtPc(distPc: number): Vec3 {
  return [0, 0, distPc * PC_TO_MPC];
}

/**
 * A FRESH ctx per call — prepareStarCut memoises on the ctx object. `viewSlot`
 * defaults to 0 (main view; a real `ReadyFrameContext.viewSlot` is always a
 * number, never undefined) — pass 1-6 for a sky-cubemap capture face.
 */
function makeCtx(camPos: Readonly<Vec3>, nowMs = 0, viewSlot = 0): ReadyFrameContext {
  return { drawCamPos: camPos, nowMs, viewSlot } as unknown as ReadyFrameContext;
}

function makeRenderer(loaded: readonly { source: number; catalog: StarCatalog }[]) {
  return {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw: vi.fn(),
  };
}

function makeState(
  renderer: unknown,
  opts: { master?: boolean; item?: boolean } = {},
): EngineState {
  const { master = true, item = true } = opts;
  return {
    gpu: { starCatalogRenderer: renderer },
    subsystems: { scheduler: { requestRender: vi.fn() } },
    settings: {
      starCatalogs: {
        enabled: master,
        sizePx: 2.5,
        brightness: 1.0,
        refineThreshold: 0.05,
        glowOverlap: 1.0,
        aggregateIntensityCap: 0.06,
        items: { gaiaStars: { enabled: item, labelEnabled: false } },
      },
    },
  } as unknown as EngineState;
}

/** A single-leaf catalog: `walkStarOctreeCut` returns one leaf draw. */
function makeCatalog(): StarCatalog {
  return {
    starCount: 1,
    nodeCount: 1,
    mortonBitsPerAxis: 9,
    cellEdgePc: 78,
    gridOrigin: [0, 0, 0],
    nodes: [{ mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 1 }],
    records: new Uint8Array(6),
  };
}

// A single leaf (index 0) parented by a level-1 aggregate root (index 1),
// shifted 10 kpc from the Sun so the walk REFINES to the leaf on the box
// (CLOSE) and COARSENS to the root aggregate to the side (FAR) — both inside
// the crossfade band, so only the cut MEMBERSHIP flips.
const LEAF_INDEX = 0;
const ROOT_INDEX = 1;
const CLOSE_PC: Vec3 = [10_000, 0, 0];
const FAR_PC: Vec3 = [10_000, 5_000, 0];

function makeTwoLevelCatalog(): StarCatalog {
  return {
    starCount: 1,
    nodeCount: 2,
    mortonBitsPerAxis: 9,
    cellEdgePc: 78,
    gridOrigin: [10_000, 0, 0],
    nodes: [
      { mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 1 }, // leaf
      { mortonIndex: 0, level: 1, childMask: 0b1, firstRecord: 1, recordCount: 1 }, // root
    ],
    records: new Uint8Array(12),
  };
}

/** A fat leaf: childMask 0 at level > 0 holding several real stars. */
function makeFatLeafCatalog(): StarCatalog {
  return {
    starCount: 5,
    nodeCount: 1,
    mortonBitsPerAxis: 9,
    cellEdgePc: 78,
    gridOrigin: [0, 0, 0],
    nodes: [{ mortonIndex: 0, level: 2, childMask: 0, firstRecord: 0, recordCount: 5 }],
    records: new Uint8Array(5 * 6),
  };
}

/** A dense level-0 leaf (3 stars) under a level-1 aggregate root (subtree 3). */
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

/** Index of a node in a stream's flat arrays (scan `[0, count)`), or -1. */
function indexInStream(stream: StarNodeStream, nodeIndex: number): number {
  for (let i = 0; i < stream.count; i++) if (stream.nodeIndex[i] === nodeIndex) return i;
  return -1;
}

/** The opacity of a node in a stream, or undefined if it is not in that stream. */
function opacityInStream(stream: StarNodeStream, nodeIndex: number): number | undefined {
  const i = indexInStream(stream, nodeIndex);
  return i === -1 ? undefined : stream.opacity[i];
}

/** The single source's streams of a non-null prepared cut. */
function onlySource(prep: PreparedStarCut | null): {
  leaf: StarNodeStream;
  aggregate: StarNodeStream;
} {
  expect(prep).not.toBeNull();
  expect(prep!.sources).toHaveLength(1);
  return prep!.sources[0]!;
}

/** Source crossfade at a parsec-frame camera position (its heliocentric dist). */
function crossfadeAt(pc: Readonly<Vec3>): number {
  return fadeBand({ fullAt: inner, goneAt: outer }, Math.hypot(pc[0], pc[1], pc[2]));
}

describe('prepareStarCut liveness', () => {
  it('returns null when the renderer is null or the master gate is off', () => {
    expect(prepareStarCut(makeState(null), makeCtx(camAtPc(inner)))).toBeNull();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    expect(
      prepareStarCut(makeState(renderer, { master: false }), makeCtx(camAtPc(inner))),
    ).toBeNull();
  });

  it('memoises on the ctx object so the walk + fade advance run once per frame', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const state = makeState(renderer);
    const ctx = makeCtx(camAtPc(inner + (outer - inner) * 0.5));
    const first = prepareStarCut(state, ctx);
    const second = prepareStarCut(state, ctx);
    // Same ctx → same cached object (never a second walk).
    expect(second).toBe(first);
    // loadedCatalogs was iterated exactly once for the frame.
    expect(renderer.loadedCatalogs).toHaveBeenCalledTimes(1);
  });

  it('forwards the source-independent shader scalars', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const prep = prepareStarCut(
      makeState(renderer),
      makeCtx(camAtPc(inner + (outer - inner) * 0.5)),
    );
    expect(prep!.sizePx).toBe(2.5);
    expect(prep!.glowOverlap).toBe(1.0);
    expect(prep!.aggregateIntensityCap).toBe(0.06);
    // brightness = slider (1.0) × the exposure ramp — a positive value.
    expect(prep!.brightness).toBeGreaterThan(0);
  });
});

describe('prepareStarCut partition', () => {
  it('routes a leaf to the leaf stream only, with isAggregate 0 and multiplier 1', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const { leaf, aggregate } = onlySource(
      prepareStarCut(makeState(renderer), makeCtx(camAtPc(inner + (outer - inner) * 0.5))),
    );
    expect(leaf.count).toBe(1);
    expect(aggregate.count).toBe(0);
    expect(leaf.isAggregate[0]).toBe(0);
    expect(leaf.subtreeStarCount[0]).toBe(1);
  });

  it('routes a fat leaf (level > 0, childMask 0) to the leaf stream, not aggregate', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeFatLeafCatalog() }]);
    const { leaf, aggregate } = onlySource(
      prepareStarCut(makeState(renderer), makeCtx(camAtPc(inner + (outer - inner) * 0.5))),
    );
    expect(aggregate.count).toBe(0);
    const i = indexInStream(leaf, 0);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(leaf.isAggregate[i]).toBe(0);
    expect(leaf.subtreeStarCount[i]).toBe(1);
  });

  it('routes an aggregate to the aggregate stream only, with isAggregate 1 and its subtree count', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeAggregateCatalog() }]);
    const { leaf, aggregate } = onlySource(
      prepareStarCut(makeState(renderer), makeCtx(camAtPcVec(FAR_PC), 0)),
    );
    expect(leaf.count).toBe(0);
    const i = indexInStream(aggregate, ROOT_INDEX);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(aggregate.isAggregate[i]).toBe(1);
    expect(aggregate.subtreeStarCount[i]).toBe(3);
  });
});

describe('prepareStarCut per-node LOD fades', () => {
  // Every test builds a FRESH catalog: fade state is keyed by catalog, so a
  // fresh catalog starts empty and its first frame snaps to the steady state.

  it('fades a leaf IN over ~250 ms as it enters the cut, and out as it leaves', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    // Frame 1: far → only the root aggregate is in the cut (aggregate stream),
    // snapped full. The leaf is in neither stream.
    const f1 = onlySource(prepareStarCut(state, makeCtx(camAtPcVec(FAR_PC), 0)));
    expect(opacityInStream(f1.leaf, LEAF_INDEX)).toBeUndefined();
    expect(opacityInStream(f1.aggregate, ROOT_INDEX)).toBeCloseTo(crossfadeAt(FAR_PC), 6);

    // Frame 2: camera closes → the leaf enters, drawn PARTWAY (50/250) through
    // its fade; the root leaves and fades out but is still in the aggregate
    // stream. Their opacities are each the crossfade × their own fade.
    const f2 = onlySource(prepareStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 50)));
    const crossClose = crossfadeAt(CLOSE_PC);
    expect(opacityInStream(f2.leaf, LEAF_INDEX)).toBeCloseTo(crossClose * (50 / 250), 6);
    expect(opacityInStream(f2.aggregate, ROOT_INDEX)).toBeCloseTo(crossClose * (1 - 50 / 250), 6);

    // Frame 3: ≥250 ms more → the leaf reaches full and the root drops entirely.
    const f3 = onlySource(prepareStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 350)));
    expect(opacityInStream(f3.leaf, LEAF_INDEX)).toBeCloseTo(crossClose, 6);
    expect(opacityInStream(f3.aggregate, ROOT_INDEX)).toBeUndefined();
  });

  it('reports anyNodeFading while a node fade is in flight (the keep-ticking vote)', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    // Frame 1: snap (first paint) — nothing mid-fade, so the vote is false.
    const f1 = prepareStarCut(state, makeCtx(camAtPcVec(FAR_PC), 0));
    expect(f1!.anyNodeFading).toBe(false);

    // Frame 2: the cut flips → nodes mid-fade → the vote is true, so runFrame's
    // shouldKeepTicking keeps the loop ticking to finish the dissolve.
    const f2 = prepareStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 50));
    expect(f2!.anyNodeFading).toBe(true);
  });
});

describe('prepareStarCut capture views (viewSlot !== 0)', () => {
  // A sky-cubemap capture face shares the catalog's fade state with the main
  // view (it's keyed per CATALOG, not per ctx) but must not participate in it —
  // it has no temporal continuity to protect, and up to six of these run before
  // the main view each real frame (see the module header).

  it('a capture ctx called right after a main-view ctx yields every cut node at full opacity, not 0', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    // Main view snaps the root aggregate full at FAR_PC.
    prepareStarCut(state, makeCtx(camAtPcVec(FAR_PC), 0));

    // A capture ctx at the SAME nowMs (dtMs would be 0 on the fade-based path,
    // pinning a NEWCOMER at opacity 0) but a different camera — its cut is just
    // the leaf. It must draw at full opacity, not fade in from 0.
    const capture = onlySource(prepareStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 0, 1)));
    expect(opacityInStream(capture.leaf, LEAF_INDEX)).toBeCloseTo(crossfadeAt(CLOSE_PC), 6);
    expect(opacityInStream(capture.aggregate, ROOT_INDEX)).toBeUndefined();
  });

  it("a capture call between two main-view calls does not perturb the main view's fade progression", () => {
    // Read each frame's opacities out IMMEDIATELY after its call — a
    // `StarNodeStream` is the SAME reused array object across frames (reset in
    // place per catalog, see its header), so a `PreparedStarCut` handle held
    // past the NEXT `prepareStarCut` call for that catalog reads that later
    // frame's contents instead.

    // Control: the same three main-view frames as the fade-timing test above,
    // with no capture call interleaved.
    const controlCatalog = makeTwoLevelCatalog();
    const controlState = makeState(
      makeRenderer([{ source: Source.GaiaStars, catalog: controlCatalog }]),
    );
    prepareStarCut(controlState, makeCtx(camAtPcVec(FAR_PC), 0));
    const control2 = onlySource(prepareStarCut(controlState, makeCtx(camAtPcVec(CLOSE_PC), 50)));
    const controlLeaf2 = opacityInStream(control2.leaf, LEAF_INDEX);
    const controlAgg2 = opacityInStream(control2.aggregate, ROOT_INDEX);
    const control3 = onlySource(prepareStarCut(controlState, makeCtx(camAtPcVec(CLOSE_PC), 350)));
    const controlLeaf3 = opacityInStream(control3.leaf, LEAF_INDEX);
    const controlAgg3Count = control3.aggregate.count;

    // Test: identical main-view frames, but with capture ctxs (different
    // viewSlots, as a real sky-cubemap sweep issues) inserted between each pair.
    const testCatalog = makeTwoLevelCatalog();
    const testState = makeState(makeRenderer([{ source: Source.GaiaStars, catalog: testCatalog }]));
    prepareStarCut(testState, makeCtx(camAtPcVec(FAR_PC), 0));
    prepareStarCut(testState, makeCtx(camAtPcVec(CLOSE_PC), 25, 1));
    const test2 = onlySource(prepareStarCut(testState, makeCtx(camAtPcVec(CLOSE_PC), 50)));
    const testLeaf2 = opacityInStream(test2.leaf, LEAF_INDEX);
    const testAgg2 = opacityInStream(test2.aggregate, ROOT_INDEX);
    prepareStarCut(testState, makeCtx(camAtPcVec(CLOSE_PC), 200, 6));
    const test3 = onlySource(prepareStarCut(testState, makeCtx(camAtPcVec(CLOSE_PC), 350)));
    const testLeaf3 = opacityInStream(test3.leaf, LEAF_INDEX);
    const testAgg3Count = test3.aggregate.count;

    expect(testLeaf2).toBeCloseTo(controlLeaf2!, 6);
    expect(testAgg2).toBeCloseTo(controlAgg2!, 6);
    expect(testLeaf3).toBeCloseTo(controlLeaf3!, 6);
    expect(testAgg3Count).toBe(controlAgg3Count);
    expect(controlAgg3Count).toBe(0);
  });

  it('a capture result reports anyNodeFading === false even while the main view is mid-fade', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    prepareStarCut(state, makeCtx(camAtPcVec(FAR_PC), 0));
    const mainMidFade = prepareStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 50));
    expect(mainMidFade!.anyNodeFading).toBe(true);

    const capture = prepareStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 50, 1));
    expect(capture!.anyNodeFading).toBe(false);
  });
});
