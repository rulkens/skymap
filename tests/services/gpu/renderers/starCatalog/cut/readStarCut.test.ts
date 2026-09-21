/**
 * advanceStarFades / readStarCut / computeStarCut / starCutFor — the per-frame
 * star cut that feeds BOTH survey-star streams, split in two halves.
 * `advanceStarFades` is the WRITE half: `runFrame` calls it once per real
 * frame, it walks the octree once over the rig's views and steps every per-node
 * LOD fade, and returns the keep-ticking vote. `computeStarCut` reads those
 * ramps and never writes them — it emits each catalog's active list at its
 * current opacity into the CPU streams, so `runFrame`'s
 * `setFrameCut` value and every real frame view's `starCutFor` → `getFrameCut`
 * read one cut with no second walk (the perf-cliff regression a
 * fan-out-by-identity scheme invites). `readStarCut` memoises the pure result
 * on ITS OWN ctx object only, for a view that owns its cut (a capture face —
 * which walks fresh, sharing no temporal state — or the pick path), and can be
 * called any number of times without nudging a ramp (the pick-path
 * double-advance bug class this file also guards against). Every drawn node is
 * PARTITIONED into the leaf stream (childless real-star nodes) or the aggregate
 * stream (interior flux-mip nodes) by `childMask`. These tests pin the
 * behaviours no compiler check catches:
 *
 *   1. The partition — every drawn node lands in exactly one stream, and the
 *      stream is chosen by `childMask` (0 ⇒ leaf) NOT `level` (a fat leaf sits
 *      at level > 0 yet is a leaf). Each stream's `isAggregate` /
 *      `subtreeStarCount` match its species.
 *   2. The per-node LOD fade — a node fades in over ~250 ms as it enters the
 *      cut and out as it leaves, its opacity the crossfade × its own fade, and
 *      a mid-fade `advanceStarFades` returns the keep-ticking vote runFrame
 *      forwards to `shouldKeepTicking`. ONLY `advanceStarFades` ticks a ramp.
 */

import { describe, it, expect, vi } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import { readStarCut } from '../../../../../../src/services/gpu/renderers/starCatalog/cut/readStarCut';
import { computeStarCut } from '../../../../../../src/services/gpu/renderers/starCatalog/cut/computeStarCut';
import { advanceStarFades } from '../../../../../../src/services/gpu/renderers/starCatalog/cut/advanceStarFades';
import { starCutFor } from '../../../../../../src/services/gpu/renderers/starCatalog/cut/starCutFor';
import { starCatalogVisible } from '../../../../../../src/services/gpu/renderers/starCatalog/cut/starCatalogVisible';
import { starCatalogPass } from '../../../../../../src/services/engine/frame/passes/starCatalogPass';
import { rebaseViewProj } from '../../../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../../src/utils/math/narrowMat4';
import { makeSlab } from '../../../../../fixtures/makeSlab';
import type { SlabView } from '../../../../../../src/@types/engine/frame/SlabView';
import type { PreparedStarCut } from '../../../../../../src/@types/rendering/PreparedStarCut';
import type { StarNodeStream } from '../../../../../../src/@types/rendering/StarNodeStream';
import { fadeBand } from '../../../../../../src/utils/math/fadeBand';
import { SCALE_UNITS } from '../../../../../../src/data/scaleUnits';
import { Source } from '../../../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../../../src/data/sources/gaia-stars';
import type { FrameView } from '../../../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../../../src/@types/engine/state/EngineState';
import type { StarCatalog } from '../../../../../../src/@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';

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
 * A FRESH ctx per call — readStarCut memoises on the ctx object. `viewSlot`
 * defaults to 0, the main view; 1-6 builds a sky-cubemap capture face's ctx.
 * `nowMs` is frame-owned (`ReadyFrameContext`), so it nests under `snapshot`.
 */
function makeCtx(camPos: Readonly<Vec3>, nowMs = 0, viewSlot = 0): FrameView {
  return {
    snapshot: { nowMs },
    drawCamPos: camPos,
    viewSlot,
    viewKind: viewSlot === 0 ? 'frame' : 'capture',
  } as unknown as FrameView;
}

/** A mono frame: the main ctx is its one view, advanced then read. */
function advance(state: EngineState, ctx: FrameView): PreparedStarCut | null {
  advanceStarFades(state, [ctx]);
  return readStarCut(state, ctx);
}

/** A spy renderer whose `setFrameCut`/`getFrameCut` are a real in-memory pair —
 *  `starCutFor` reads the frame cut off exactly these for a non-capture ctx. */
function makeRenderer(loaded: readonly { source: number; catalog: StarCatalog }[]) {
  let frameCut: PreparedStarCut | null = null;
  return {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw: vi.fn(),
    setFrameCut: vi.fn((cut: PreparedStarCut | null) => {
      frameCut = cut;
    }),
    getFrameCut: vi.fn(() => frameCut),
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

// A single leaf parented by a level-1 aggregate root, shifted 10 kpc from the
// Sun so the walk REFINES to the leaf on the box (CLOSE) and COARSENS to the
// root aggregate to the side (FAR) — both inside the crossfade band, so only
// the cut MEMBERSHIP flips.
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

/**
 * Index of a stream's one entry, or -1 if empty — every fixture below draws
 * at most one node per stream, so "present" and "at slot 0" coincide.
 */
function soleIndex(stream: StarNodeStream): number {
  return stream.count > 0 ? 0 : -1;
}

/** The opacity of a stream's one entry, or undefined if it has none. */
function soleOpacity(stream: StarNodeStream): number | undefined {
  const i = soleIndex(stream);
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

describe('readStarCut liveness', () => {
  it('returns null when the renderer is null or the master gate is off', () => {
    expect(readStarCut(makeState(null), makeCtx(camAtPc(inner)))).toBeNull();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    expect(readStarCut(makeState(renderer, { master: false }), makeCtx(camAtPc(inner)))).toBeNull();
  });

  it('memoises on the ctx object so the walk runs once per frame', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const state = makeState(renderer);
    const ctx = makeCtx(camAtPc(inner + (outer - inner) * 0.5));
    const first = readStarCut(state, ctx);
    const second = readStarCut(state, ctx);
    // Same ctx → same cached object (never a second walk).
    expect(second).toBe(first);
    // loadedCatalogs was iterated exactly once for the frame.
    expect(renderer.loadedCatalogs).toHaveBeenCalledTimes(1);
  });

  it('forwards the source-independent shader scalars', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const state = makeState(renderer);
    const ctx = makeCtx(camAtPc(inner + (outer - inner) * 0.5));
    const prep = advance(state, ctx);
    expect(prep!.sizePx).toBe(2.5);
    expect(prep!.glowOverlap).toBe(1.0);
    expect(prep!.aggregateIntensityCap).toBe(0.06);
    // brightness = slider (1.0) × the exposure ramp — a positive value.
    expect(prep!.brightness).toBeGreaterThan(0);
  });
});

describe('readStarCut partition', () => {
  it('routes a leaf to the leaf stream only, with isAggregate 0 and multiplier 1', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const { leaf, aggregate } = onlySource(
      advance(makeState(renderer), makeCtx(camAtPc(inner + (outer - inner) * 0.5))),
    );
    expect(leaf.count).toBe(1);
    expect(aggregate.count).toBe(0);
    expect(leaf.isAggregate[0]).toBe(0);
    expect(leaf.subtreeStarCount[0]).toBe(1);
  });

  it('routes a fat leaf (level > 0, childMask 0) to the leaf stream, not aggregate', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeFatLeafCatalog() }]);
    const { leaf, aggregate } = onlySource(
      advance(makeState(renderer), makeCtx(camAtPc(inner + (outer - inner) * 0.5))),
    );
    expect(aggregate.count).toBe(0);
    const i = soleIndex(leaf);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(leaf.isAggregate[i]).toBe(0);
    expect(leaf.subtreeStarCount[i]).toBe(1);
  });

  it('routes an aggregate to the aggregate stream only, with isAggregate 1 and its subtree count', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeAggregateCatalog() }]);
    const { leaf, aggregate } = onlySource(
      advance(makeState(renderer), makeCtx(camAtPcVec(FAR_PC), 0)),
    );
    expect(leaf.count).toBe(0);
    const i = soleIndex(aggregate);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(aggregate.isAggregate[i]).toBe(1);
    expect(aggregate.subtreeStarCount[i]).toBe(3);
  });
});

describe('readStarCut per-node LOD fades', () => {
  // Every test builds a FRESH catalog: fade state is keyed by catalog, so a
  // fresh catalog starts empty and its first frame snaps to the steady state.
  // Each simulated frame advances via `advanceStarFades` — the one call that
  // ticks a ramp — then reads, mirroring runFrame's real pair.

  it('fades a leaf IN over ~250 ms as it enters the cut, and out as it leaves', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    // Frame 1: far → only the root aggregate is in the cut (aggregate stream),
    // snapped full. The leaf is in neither stream.
    const f1 = onlySource(advance(state, makeCtx(camAtPcVec(FAR_PC), 0)));
    expect(soleOpacity(f1.leaf)).toBeUndefined();
    expect(soleOpacity(f1.aggregate)).toBeCloseTo(crossfadeAt(FAR_PC), 6);

    // Frame 2: camera closes → the leaf enters, drawn PARTWAY (50/250) through
    // its fade; the root leaves and fades out but is still in the aggregate
    // stream. Their opacities are each the crossfade × their own fade.
    const f2 = onlySource(advance(state, makeCtx(camAtPcVec(CLOSE_PC), 50)));
    const crossClose = crossfadeAt(CLOSE_PC);
    expect(soleOpacity(f2.leaf)).toBeCloseTo(crossClose * (50 / 250), 6);
    expect(soleOpacity(f2.aggregate)).toBeCloseTo(crossClose * (1 - 50 / 250), 6);

    // Frame 3: ≥250 ms more → the leaf reaches full and the root drops entirely.
    const f3 = onlySource(advance(state, makeCtx(camAtPcVec(CLOSE_PC), 350)));
    expect(soleOpacity(f3.leaf)).toBeCloseTo(crossClose, 6);
    expect(soleOpacity(f3.aggregate)).toBeUndefined();
  });

  it('advanceStarFades returns the keep-ticking vote while a node fade is in flight', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    // Frame 1: snap (first paint) — nothing mid-fade, so the vote is false.
    expect(advanceStarFades(state, [makeCtx(camAtPcVec(FAR_PC), 0)])).toBe(false);

    // Frame 2: the cut flips → nodes mid-fade → the vote is true, so runFrame's
    // shouldKeepTicking keeps the loop ticking to finish the dissolve.
    expect(advanceStarFades(state, [makeCtx(camAtPcVec(CLOSE_PC), 50)])).toBe(true);
  });

  it('advanceStarFades steps a ramp once per call, whatever readStarCut does around it', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    advanceStarFades(state, [makeCtx(camAtPcVec(FAR_PC), 0)]); // snap
    advanceStarFades(state, [makeCtx(camAtPcVec(CLOSE_PC), 50)]);
    // Two reads on fresh ctxs, as the pick path issues between frames.
    readStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 50));
    readStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 50));
    advanceStarFades(state, [makeCtx(camAtPcVec(CLOSE_PC), 100)]);

    // Two 50 ms steps of the one ramp, the reads contributing none: a read
    // path that stepped on a clock of its own would land the leaf past this.
    const read = onlySource(readStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 100)));
    expect(soleOpacity(read.leaf)).toBeCloseTo(crossfadeAt(CLOSE_PC) * (100 / 250), 6);
  });

  it('readStarCut alone never advances a ramp — two different ctx objects at the same nowMs leave opacity unchanged', () => {
    // The pick-path bug class this file guards against: the pick pass hands
    // `readStarCut` a FRESH ctx (never the one the advance call primed),
    // so a naive re-walk that re-ran the advance would nudge the ramp forward
    // a second time between two real frames. `readStarCut` must instead
    // read the fade state as-is, however many times or ctx objects it is
    // called with.
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    advance(state, makeCtx(camAtPcVec(FAR_PC), 0));
    const first = onlySource(advance(state, makeCtx(camAtPcVec(CLOSE_PC), 50)));
    const firstLeafOp = soleOpacity(first.leaf);

    // A second, unrelated ctx (same nowMs, as a pick recompute right after the
    // frame that just advanced would be) reads the cut via readStarCut.
    const second = onlySource(readStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 50)));
    expect(soleOpacity(second.leaf)).toBe(firstLeafOp);

    // A THIRD such read-only call still leaves it unchanged.
    const third = onlySource(readStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 50)));
    expect(soleOpacity(third.leaf)).toBe(firstLeafOp);
  });
});

describe('readStarCut stream aliasing across views (regression)', () => {
  // Capture-face walks (viewSlot ≥ 1) run AFTER the main view's own
  // prime but BEFORE its draw (see runFrame/FRAME_ORDER ordering). If the
  // persistent leaf/aggregate streams were keyed by catalog alone, a capture
  // face's walk would reset+refill the SAME stream objects the main view's
  // already-cached `PreparedStarCut` still references, so the main view would
  // draw the last capture face's cut instead of its own.

  it("a capture walk for a different viewSlot does not corrupt the main view's already-prepared streams", () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    // Main view (viewSlot 0) close in → its cut is the leaf alone.
    const main = onlySource(advance(state, makeCtx(camAtPcVec(CLOSE_PC), 0)));
    expect(main.leaf.count).toBe(1);
    expect(main.leaf.firstRecord[0]).toBe(0);

    // A capture face (viewSlot 1) walks the SAME catalog from far away → its
    // cut is the root aggregate alone, a different partition entirely.
    readStarCut(state, makeCtx(camAtPcVec(FAR_PC), 0, 1));

    // The main view's already-prepared leaf stream must still hold ITS OWN
    // node — not have been reset/refilled by the capture face's walk.
    expect(main.leaf.count).toBe(1);
    expect(main.leaf.firstRecord[0]).toBe(0);
  });
});

describe('readStarCut capture views (viewKind capture)', () => {
  // A sky-cubemap capture face shares the catalog's fade state with the main
  // view (it's keyed per CATALOG, not per ctx) but must not participate in it —
  // it has no temporal continuity to protect, and up to six of these run before
  // the main view each real frame (see the module header).

  it('a capture ctx called right after a main-view ctx yields every cut node at full opacity, not 0', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);

    // Main view snaps the root aggregate full at FAR_PC.
    advance(state, makeCtx(camAtPcVec(FAR_PC), 0));

    // A capture ctx at the SAME nowMs (dtMs would be 0 on the fade-based path,
    // pinning a NEWCOMER at opacity 0) but a different camera — its cut is just
    // the leaf. It must draw at full opacity, not fade in from 0.
    const capture = onlySource(readStarCut(state, makeCtx(camAtPcVec(CLOSE_PC), 0, 1)));
    expect(soleOpacity(capture.leaf)).toBeCloseTo(crossfadeAt(CLOSE_PC), 6);
    expect(soleOpacity(capture.aggregate)).toBeUndefined();
  });

  it("a capture call between two main-view calls does not perturb the main view's fade progression", () => {
    // Read each frame's opacities out IMMEDIATELY after its call — a
    // `StarNodeStream` is the SAME reused array object across frames (reset in
    // place per catalog, see its header), so a `PreparedStarCut` handle held
    // past the NEXT `readStarCut` call for that catalog reads that later
    // frame's contents instead.

    // Control: the same three main-view frames as the fade-timing test above,
    // with no capture call interleaved.
    const controlCatalog = makeTwoLevelCatalog();
    const controlState = makeState(
      makeRenderer([{ source: Source.GaiaStars, catalog: controlCatalog }]),
    );
    advance(controlState, makeCtx(camAtPcVec(FAR_PC), 0));
    const control2 = onlySource(advance(controlState, makeCtx(camAtPcVec(CLOSE_PC), 50)));
    const controlLeaf2 = soleOpacity(control2.leaf);
    const controlAgg2 = soleOpacity(control2.aggregate);
    const control3 = onlySource(advance(controlState, makeCtx(camAtPcVec(CLOSE_PC), 350)));
    const controlLeaf3 = soleOpacity(control3.leaf);
    const controlAgg3Count = control3.aggregate.count;

    // Test: identical main-view frames, but with capture ctxs (different
    // viewSlots, as a real sky-cubemap sweep issues) inserted between each pair.
    const testCatalog = makeTwoLevelCatalog();
    const testState = makeState(makeRenderer([{ source: Source.GaiaStars, catalog: testCatalog }]));
    advance(testState, makeCtx(camAtPcVec(FAR_PC), 0));
    readStarCut(testState, makeCtx(camAtPcVec(CLOSE_PC), 25, 1));
    const test2 = onlySource(advance(testState, makeCtx(camAtPcVec(CLOSE_PC), 50)));
    const testLeaf2 = soleOpacity(test2.leaf);
    const testAgg2 = soleOpacity(test2.aggregate);
    readStarCut(testState, makeCtx(camAtPcVec(CLOSE_PC), 200, 6));
    const test3 = onlySource(advance(testState, makeCtx(camAtPcVec(CLOSE_PC), 350)));
    const testLeaf3 = soleOpacity(test3.leaf);
    const testAgg3Count = test3.aggregate.count;

    expect(testLeaf2).toBeCloseTo(controlLeaf2!, 6);
    expect(testAgg2).toBeCloseTo(controlAgg2!, 6);
    expect(testLeaf3).toBeCloseTo(controlLeaf3!, 6);
    expect(testAgg3Count).toBe(controlAgg3Count);
    expect(controlAgg3Count).toBe(0);
  });
});

describe('the frame star cut over several views', () => {
  const FOV = Math.PI / 3;
  const VIEWPORT = { width: 1000, height: 1000 };

  /** A frame view at `eyeMpc` looking at `targetMpc`, with a real NEAR0 slab. */
  function viewCtx(eyeMpc: Vec3, targetMpc: Vec3, nowMs = 0): FrameView {
    const proj = mat4d.perspective(FOV, 1, 1e-9, 1, new Float64Array(16));
    const look = mat4d.lookAt(eyeMpc, targetMpc, [0, 1, 0], new Float64Array(16));
    const vp = mat4d.multiply(proj, look, new Float64Array(16)) as Float64Array;
    return {
      snapshot: { nowMs },
      drawCamPos: eyeMpc,
      viewSlot: 0,
      viewKind: 'frame',
      canvasSize: VIEWPORT,
      slabs: [makeSlab({ vp })],
    } as unknown as FrameView;
  }

  // The single leaf box spans [0, 78] pc; the eye sits mid-band out along +z.
  const EYE = camAtPcVec([39, 39, inner + (outer - inner) * 0.5]);
  const TOWARD = camAtPcVec([39, 39, 0]);
  const AWAY: Vec3 = [EYE[0], EYE[1], EYE[2] * 2];

  it('a star node visible only in the second view is in the frame cut', () => {
    // A frame of one view looking away: the walk prunes the star's box.
    const away = viewCtx(EYE, AWAY);
    const awayState = makeState(
      makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]),
    );
    advanceStarFades(awayState, [away]);
    expect(onlySource(computeStarCut(awayState, [away])).leaf.count).toBe(0);

    // A fresh frame (fresh contexts — the cut memoises on the main one) whose
    // rig adds a view looking AT the box: the union of the frusta keeps it.
    const main = viewCtx(EYE, AWAY);
    const rig = [main, viewCtx(EYE, TOWARD)];
    const state = makeState(makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]));
    advanceStarFades(state, rig);
    const both = onlySource(computeStarCut(state, rig));
    expect(both.leaf.count).toBe(1);
  });

  it('two frame views in one frame advance fades once, and share the one cut via setFrameCut/starCutFor', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);
    advance(state, makeCtx(camAtPcVec(FAR_PC), 0));

    const main = makeCtx(camAtPcVec(CLOSE_PC), 50);
    const second = makeCtx(camAtPcVec(CLOSE_PC), 50);
    advanceStarFades(state, [main, second]);
    const cut = computeStarCut(state, [main, second]);
    // One 50 ms step, not two.
    expect(soleOpacity(onlySource(cut).leaf)).toBeCloseTo(crossfadeAt(CLOSE_PC) * (50 / 250), 6);

    // `runFrame`'s hand-off: both views read the SAME cut through
    // `setFrameCut`/`starCutFor`, not a re-walk keyed on their own identity.
    renderer.setFrameCut(cut);
    expect(starCutFor(state, second)).toBe(cut);
    expect(starCutFor(state, main)).toBe(cut);
  });

  it('a frame view NOT in the advance list still reads the frame cut, with no second walk (the perf-cliff regression this exists to catch)', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const state = makeState(renderer);
    const main = makeCtx(camAtPc(inner + (outer - inner) * 0.5));
    advanceStarFades(state, [main]);
    const advanced = computeStarCut(state, [main]);
    renderer.setFrameCut(advanced);

    // A second view the rig derives AFTER the advance call — e.g. a dome face
    // or an XR eye — never passed to the advance call's `views` list.
    const second = makeCtx(camAtPc(inner + (outer - inner) * 0.5));
    expect(starCutFor(state, second)).toBe(advanced);
    // Still just the frame's own pair of source passes (advance, then emit):
    // `starCutFor` reads the stored value for a view outside the advance list
    // rather than walking the octree again for it.
    expect(renderer.loadedCatalogs).toHaveBeenCalledTimes(2);
  });

  it('a star cut prepared at origin A and drawn with a view at B rebases about A', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const state = makeState(renderer);
    const a = viewCtx(EYE, TOWARD);
    advanceStarFades(state, [a]);
    const cut = computeStarCut(state, [a]);
    expect(onlySource(cut).leaf.count).toBe(1);
    renderer.setFrameCut(cut);

    const b: Vec3 = [EYE[0] + 1e-6, EYE[1], EYE[2]];
    const slab = a.slabs[0]!;
    const viewAtB: SlabView = {
      slab,
      vp: new Float32Array(16),
      camPos: b,
      viewportPx: [1000, 1000],
    };
    starCatalogPass.draw(null as unknown as GPURenderPassEncoder, viewAtB, a, state);

    const drawnVp = renderer.draw.mock.calls[0]![1].vp;
    expect(Array.from(drawnVp)).toEqual(Array.from(narrowMat4(rebaseViewProj(slab.vp, EYE))));
    expect(Array.from(drawnVp)).not.toEqual(Array.from(narrowMat4(rebaseViewProj(slab.vp, b))));
  });
});

/**
 * `starCatalogVisible` is a SECOND copy of the predicate `computeStarCut` runs
 * to decide whether a source contributes: renderer, master toggle, per-item
 * toggle, crossfade band. Two copies is deliberate — the gate must answer
 * without walking the octree, which is what `enabled` running before the pass
 * is allocated buys (a faded-out bubble costs zero GPU, not an empty
 * `beginRenderPass`). The cost of that choice is that the copies can drift
 * apart silently, and nothing else would catch it.
 */
describe('starCatalogVisible agrees with the cut it gates', () => {
  const agrees = (state: EngineState, camPos: Readonly<Vec3>): void => {
    const ctx = makeCtx(camPos);
    const drawsSomething = (readStarCut(state, ctx)?.sources.length ?? 0) > 0;
    expect(starCatalogVisible(state, ctx)).toBe(drawsSomething);
  };

  const withCatalog = (opts: { master?: boolean; item?: boolean } = {}): EngineState =>
    makeState(makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]), opts);

  it('agrees when no renderer has bootstrapped yet', () => {
    agrees(makeState(null), camAtPc(inner / 2));
  });

  it('agrees with the master toggle off', () => {
    agrees(withCatalog({ master: false }), camAtPc(inner / 2));
  });

  it('agrees with the per-item toggle off', () => {
    agrees(withCatalog({ item: false }), camAtPc(inner / 2));
  });

  // The band edges are where a drifting copy would first disagree: `inner` and
  // `outer` bracket the only camera range in which the two can differ at all.
  it.each([
    ['well inside the band', inner / 2],
    ['at the full edge', inner],
    ['mid-band', (inner + outer) / 2],
    ['at the gone edge', outer],
    ['past the gone edge', outer * 2],
  ])('agrees %s', (_label, distPc) => {
    agrees(withCatalog(), camAtPc(distPc));
  });
});
