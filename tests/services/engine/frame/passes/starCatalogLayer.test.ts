/**
 * starCatalogLayer — unit tests for the survey (Gaia bin) star content row.
 *
 * Two behaviours are load-bearing and asserted here:
 *
 *   1. The `enabled` gate follows the toggles AND the recede-direction
 *      crossfade band. The band IS the far gate (there is no
 *      FOREGROUND_MAX_DISTANCE_MPC cut — the bubble extends well past the
 *      ≤25 pc scene stars): full inside `crossfadePc.inner`, gone past
 *      `crossfadePc.outer`, where the procedural Milky-Way cloud takes over.
 *      A camera past `outer` (or the master gate off, or the per-item toggle
 *      off, or a null renderer) closes the gate — opacity 0 ⇒ no render work
 *      (house rule: gate at `enabled`, not inside `draw`).
 *
 *   2. `draw` computes the rebased view-projection ONCE per frame and hands
 *      the IDENTICAL matrix to every source's `renderer.draw`. The renderer's
 *      camera uniform is one shared buffer rewritten on every draw call, safe
 *      only because every source in a frame receives the same rebased vp — the
 *      test yields two loaded catalogs and asserts both draws got the same
 *      matrix reference (never a per-source rebase).
 */

import { describe, it, expect, vi } from 'vitest';

import { starCatalogLayer } from '../../../../../src/services/engine/frame/passes/starCatalogLayer';
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../src/utils/math/narrowMat4';
import { fadeBand } from '../../../../../src/utils/math/fadeBand';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../../src/data/sources/gaia-stars';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogDrawArgs } from '../../../../../src/@types/rendering/StarCatalogRenderer';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const MPC_TO_PC = 1 / SCALE_UNITS.PC_TO_MPC;
const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const CTX_STUB = {} as ReadyFrameContext;

/** A camera down +z at the given heliocentric distance, in parsecs. */
function camAtPc(distPc: number): Vec3 {
  return [0, 0, distPc * SCALE_UNITS.PC_TO_MPC];
}

/** A parsec-frame camera position expressed in the scene's Mpc frame. */
function camAtPcVec(pc: Readonly<Vec3>): Vec3 {
  return [pc[0] * PC_TO_MPC, pc[1] * PC_TO_MPC, pc[2] * PC_TO_MPC];
}

function makeCtx(camPos: Readonly<Vec3>, nowMs = 0): ReadyFrameContext {
  return { drawCamPos: camPos, nowMs } as unknown as ReadyFrameContext;
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

// ── A two-level octree for the LOD-fade tests ────────────────────────────────
// A single leaf (index 0) parented by a level-1 aggregate (index 1, the root),
// with `gridOrigin` shifted 10 kpc from the Sun. Placed so the walk REFINES to
// the leaf when the camera sits on the box (`CLOSE_PC`) and COARSENS to the root
// aggregate when it pulls to the side (`FAR_PC`) — both heliocentric distances
// stay inside the Gaia crossfade band, so the source draws in either regime and
// only the cut MEMBERSHIP flips. That flip is exactly the split/merge the
// per-node fade smooths, and moving between the two cameras drives it.
const LEAF_INDEX = 0;
const ROOT_INDEX = 1;
const CLOSE_PC: Vec3 = [10_000, 0, 0]; // on the box → refine → cut = { leaf }
const FAR_PC: Vec3 = [10_000, 5_000, 0]; // to the side → coarsen → cut = { root }

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

/** The per-node draw opacity of a given node index, or undefined if not drawn. */
function opacityOfNode(args: StarCatalogDrawArgs, nodeIndex: number): number | undefined {
  const i = args.nodeDraws.findIndex((d) => d.nodeIndex === nodeIndex);
  return i === -1 ? undefined : args.opacity[i];
}

/** The args of the most recent `renderer.draw` call. */
function lastDrawArgs(
  renderer: { draw: { mock: { calls: [GPURenderPassEncoder, StarCatalogDrawArgs][] } } },
): StarCatalogDrawArgs {
  const { calls } = renderer.draw.mock;
  return calls[calls.length - 1]![1];
}

/** Source crossfade at a parsec-frame camera position (its heliocentric dist). */
function crossfadeAt(pc: Readonly<Vec3>): number {
  return fadeBand({ fullAt: inner, goneAt: outer }, Math.hypot(pc[0], pc[1], pc[2]));
}

/** A spy renderer over the StarCatalogRenderer draw surface. */
function makeRenderer(loaded: readonly { source: number; catalog: StarCatalog }[]) {
  return {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw: vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs) => void>(),
  };
}

function makeState(
  renderer: unknown,
  opts: {
    master?: boolean;
    item?: boolean;
    size?: number;
    brightness?: number;
    refineThreshold?: number;
    glowOverlap?: number;
  } = {},
): EngineState {
  const {
    master = true,
    item = true,
    size = 2.5,
    brightness = 1.0,
    refineThreshold = 0.05,
    glowOverlap = 1.0,
  } = opts;
  return {
    gpu: { starCatalogRenderer: renderer },
    // The LOD-fade wake hook: the layer calls scheduler.requestRender() while any
    // node is mid-fade (same channel foregroundLabelsLayer uses for captions).
    subsystems: { scheduler: { requestRender: vi.fn() } },
    settings: {
      starCatalogs: {
        enabled: master,
        sizePx: size,
        brightness,
        refineThreshold,
        glowOverlap,
        items: { gaiaStars: { enabled: item, labelEnabled: false } },
      },
    },
  } as unknown as EngineState;
}

/**
 * A NEAR0 SlabView whose f64 `slab.vp` and f32 `vp` are DIFFERENT arrays, so
 * an identity check reveals the layer rebases off the f64 slab vp, not the
 * pre-narrowed `view.vp`.
 */
function makeNear0View(camPos: Vec3): SlabView {
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: Float64Array.from({ length: 16 }, (_, i) => i + 0.5),
    originRelative: true,
    precision: 'f64',
  };
  return { slab, vp: new Float32Array(16), camPos, viewportPx: [1280, 720] };
}

const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;

describe('starCatalogLayer.enabled', () => {
  it('is false while the renderer handle is null (pre-bootstrap)', () => {
    const state = makeState(null);
    expect(starCatalogLayer.enabled(state, CTX_STUB)).toBe(false);
  });

  it('follows the master gate, the per-item toggle, and the crossfade band', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    // Inside the band (a hair past inner, still well before outer) → opacity > 0.
    const insideCtx = makeCtx(camAtPc(inner + (outer - inner) * 0.25));
    expect(starCatalogLayer.enabled(makeState(renderer), insideCtx)).toBe(true);

    // Past outer → the recede band has faded to zero → the far gate closes.
    const beyondCtx = makeCtx(camAtPc(outer + 1000));
    expect(starCatalogLayer.enabled(makeState(renderer), beyondCtx)).toBe(false);

    // Master gate off, per-item toggle off → false even inside the band.
    expect(starCatalogLayer.enabled(makeState(renderer, { master: false }), insideCtx)).toBe(false);
    expect(starCatalogLayer.enabled(makeState(renderer, { item: false }), insideCtx)).toBe(false);
  });
});

describe('starCatalogLayer.draw', () => {
  it('hands every loaded catalog the SAME rebased vp and its crossfade opacity', () => {
    // Two loaded catalogs (same source) exercise the shared-buffer invariant:
    // the rebased vp must be computed once and passed identically to each draw.
    const loaded = [
      { source: Source.GaiaStars, catalog: makeCatalog() },
      { source: Source.GaiaStars, catalog: makeCatalog() },
    ];
    const renderer = makeRenderer(loaded);
    const camPos = camAtPc(inner + (outer - inner) * 0.5); // mid-band → partial opacity
    const view = makeNear0View(camPos);

    starCatalogLayer.draw(PASS_STUB, view, makeCtx(camPos), makeState(renderer));

    expect(renderer.draw).toHaveBeenCalledTimes(2);
    const [firstArgs] = renderer.draw.mock.calls[0]! as [GPURenderPassEncoder, StarCatalogDrawArgs];
    const call0 = renderer.draw.mock.calls[0]![1];
    const call1 = renderer.draw.mock.calls[1]![1];

    // Same rebased-vp REFERENCE to both draws (computed once per frame), and
    // it is the f32 narrow of the f64 rebase off the slab vp — not the raw
    // pre-narrowed view.vp.
    const expectedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
    expect(call0.vp).toBe(call1.vp);
    expect(call0.vp).not.toBe(view.vp);
    expect(call0.vp).toEqual(expectedVp);

    // Per-node opacity is parallel to nodeDraws. On a catalog's FIRST frame every
    // node snaps straight to its LOD target (fade = 1), so the drawn value is the
    // pure source crossfade at the camera's heliocentric distance — partial
    // mid-band (0 < opacity < 1).
    const camDistPc = Math.hypot(...camPos) * MPC_TO_PC;
    const expectedOpacity = fadeBand({ fullAt: inner, goneAt: outer }, camDistPc);
    expect(call0.opacity.length).toBe(call0.nodeDraws.length);
    expect(call0.opacity[0]).toBeCloseTo(expectedOpacity, 10);
    expect(expectedOpacity).toBeGreaterThan(0);
    expect(expectedOpacity).toBeLessThan(1);

    // The walked cut and its parallel per-node arrays are non-empty + aligned.
    expect(firstArgs).toBe(PASS_STUB);
    expect(call0.source).toBe(Source.GaiaStars);
    expect(call0.nodeDraws.length).toBe(1);
    expect(call0.originRelCamMpc.length).toBe(call0.nodeDraws.length);
    expect(call0.cellScaleMpc.length).toBe(call0.nodeDraws.length);
    // The flux-glow leaf/aggregate discriminant rides parallel too; the
    // single-leaf fixture's one node is level 0 (a point-source leaf).
    expect(call0.level.length).toBe(call0.nodeDraws.length);
    expect(call0.level[0]).toBe(0);
    // The flux-reconstruction multiplier rides parallel too; the single-leaf
    // fixture's one node is a leaf, so its record stands in for one real star.
    expect(call0.subtreeStarCount.length).toBe(call0.nodeDraws.length);
    expect(call0.subtreeStarCount[0]).toBe(1);
  });

  it('forwards the live star-size setting to every source draw', () => {
    // The user's `settings.starCatalogs.sizePx` must reach the renderer so the
    // vertex ramp can rescale the star dots. Change it in the store fixture and
    // assert the stubbed renderer receives the new value (source-independent —
    // the same value on each draw).
    const loaded = [
      { source: Source.GaiaStars, catalog: makeCatalog() },
      { source: Source.GaiaStars, catalog: makeCatalog() },
    ];
    const renderer = makeRenderer(loaded);
    const camPos = camAtPc(inner + (outer - inner) * 0.5);
    const view = makeNear0View(camPos);

    starCatalogLayer.draw(PASS_STUB, view, makeCtx(camPos), makeState(renderer, { size: 6.25 }));

    expect(renderer.draw).toHaveBeenCalledTimes(2);
    expect(renderer.draw.mock.calls[0]![1].sizePx).toBe(6.25);
    expect(renderer.draw.mock.calls[1]![1].sizePx).toBe(6.25);
  });

  it('forwards the live star-brightness setting to every source draw', () => {
    // The user's `settings.starCatalogs.brightness` must reach the renderer so
    // the flux-glow peak is scaled by it. Change it in the store fixture and
    // assert the stubbed renderer receives the new value (source-independent —
    // the same value on each draw).
    const loaded = [
      { source: Source.GaiaStars, catalog: makeCatalog() },
      { source: Source.GaiaStars, catalog: makeCatalog() },
    ];
    const renderer = makeRenderer(loaded);
    const camPos = camAtPc(inner + (outer - inner) * 0.5);
    const view = makeNear0View(camPos);

    starCatalogLayer.draw(
      PASS_STUB,
      view,
      makeCtx(camPos),
      makeState(renderer, { brightness: 2.5 }),
    );

    expect(renderer.draw).toHaveBeenCalledTimes(2);
    expect(renderer.draw.mock.calls[0]![1].brightness).toBe(2.5);
    expect(renderer.draw.mock.calls[1]![1].brightness).toBe(2.5);
  });

  it('forwards the live glow-overlap setting to every source draw', () => {
    // The user's `settings.starCatalogs.glowOverlap` must reach the renderer so
    // the vertex stage can spread aggregate glows. Source-independent — the same
    // value on each draw. (refineThreshold, by contrast, is a CPU walk input and
    // never reaches renderer.draw; its behaviour is covered in walkStarOctreeCut.)
    const loaded = [
      { source: Source.GaiaStars, catalog: makeCatalog() },
      { source: Source.GaiaStars, catalog: makeCatalog() },
    ];
    const renderer = makeRenderer(loaded);
    const camPos = camAtPc(inner + (outer - inner) * 0.5);
    const view = makeNear0View(camPos);

    starCatalogLayer.draw(
      PASS_STUB,
      view,
      makeCtx(camPos),
      makeState(renderer, { glowOverlap: 2.2 }),
    );

    expect(renderer.draw).toHaveBeenCalledTimes(2);
    expect(renderer.draw.mock.calls[0]![1].glowOverlap).toBe(2.2);
    expect(renderer.draw.mock.calls[1]![1].glowOverlap).toBe(2.2);
  });

  it('is a no-op when the renderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View(camAtPc(inner));
    const state = makeState(null);
    expect(() => starCatalogLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});

describe('starCatalogLayer.draw per-node LOD fades', () => {
  // Every test builds a FRESH catalog object: the fade state is keyed by catalog,
  // so a fresh catalog starts with empty fade state and its first draw snaps —
  // the tests are isolated with no shared-clock bookkeeping. Each test's first
  // frame establishes the steady state; later frames drive the membership flip.

  it('fades a node IN over ~250 ms when it newly enters the cut', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);
    const farView = makeNear0View(camAtPcVec(FAR_PC));
    const closeView = makeNear0View(camAtPcVec(CLOSE_PC));

    // Frame 1 (first frame of this catalog): far → only the root aggregate is in
    // the cut, snapped to full on the steady-state first paint. The leaf is absent.
    starCatalogLayer.draw(PASS_STUB, farView, makeCtx(camAtPcVec(FAR_PC), 0), state);
    expect(opacityOfNode(lastDrawArgs(renderer), LEAF_INDEX)).toBeUndefined();

    // Frame 2: camera closes → the leaf newly enters the cut. Only 50 ms of dt,
    // so on its FIRST frame it is drawn PARTWAY through its fade, below full.
    starCatalogLayer.draw(PASS_STUB, closeView, makeCtx(camAtPcVec(CLOSE_PC), 50), state);
    const crossfadeClose = crossfadeAt(CLOSE_PC);
    const leafEntering = opacityOfNode(lastDrawArgs(renderer), LEAF_INDEX);
    expect(leafEntering).toBeGreaterThan(0);
    expect(leafEntering).toBeLessThan(crossfadeClose); // faded in, not yet full
    expect(leafEntering).toBeCloseTo(crossfadeClose * (50 / 250), 6);

    // Frame 3: ≥250 ms more of dt → the leaf reaches full (crossfade × fade 1).
    starCatalogLayer.draw(PASS_STUB, closeView, makeCtx(camAtPcVec(CLOSE_PC), 350), state);
    expect(opacityOfNode(lastDrawArgs(renderer), LEAF_INDEX)).toBeCloseTo(crossfadeClose, 6);
  });

  it('keeps a leaving node drawn while it fades OUT, then drops it once faded', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);
    const farView = makeNear0View(camAtPcVec(FAR_PC));
    const closeView = makeNear0View(camAtPcVec(CLOSE_PC));

    // Frame 1: close → the leaf is in the cut, snapped to full.
    starCatalogLayer.draw(PASS_STUB, closeView, makeCtx(camAtPcVec(CLOSE_PC), 0), state);
    expect(opacityOfNode(lastDrawArgs(renderer), LEAF_INDEX)).toBeGreaterThan(0);

    // Frame 2: camera pulls back → the leaf LEAVES the cut (the root aggregate
    // takes over). Small dt → the leaf is STILL drawn, now fading out below full.
    starCatalogLayer.draw(PASS_STUB, farView, makeCtx(camAtPcVec(FAR_PC), 50), state);
    const leafLeaving = opacityOfNode(lastDrawArgs(renderer), LEAF_INDEX);
    expect(leafLeaving).toBeGreaterThan(0); // still drawn while fading
    expect(leafLeaving).toBeCloseTo(crossfadeAt(FAR_PC) * (1 - 50 / 250), 6);

    // Frame 3: ≥250 ms more of dt → the leaf reaches 0 and is dropped entirely.
    starCatalogLayer.draw(PASS_STUB, farView, makeCtx(camAtPcVec(FAR_PC), 350), state);
    expect(opacityOfNode(lastDrawArgs(renderer), LEAF_INDEX)).toBeUndefined();
  });

  it('multiplies each node opacity by its own LOD fade times the shared crossfade', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);
    const farView = makeNear0View(camAtPcVec(FAR_PC));
    const closeView = makeNear0View(camAtPcVec(CLOSE_PC));

    // Frame 1: far → root snapped to full.
    starCatalogLayer.draw(PASS_STUB, farView, makeCtx(camAtPcVec(FAR_PC), 0), state);

    // Frame 2: close with 100 ms of dt → the leaf enters (fade 0.4) as the root
    // leaves (fade 0.6). BOTH draw this frame; each opacity is the SAME source
    // crossfade times its OWN node fade — the product this test pins.
    starCatalogLayer.draw(PASS_STUB, closeView, makeCtx(camAtPcVec(CLOSE_PC), 100), state);
    const args = lastDrawArgs(renderer);
    const crossfade = crossfadeAt(CLOSE_PC);
    const leafOp = opacityOfNode(args, LEAF_INDEX)!;
    const rootOp = opacityOfNode(args, ROOT_INDEX)!;
    expect(leafOp).toBeCloseTo(crossfade * (100 / 250), 6); // fade 0.4
    expect(rootOp).toBeCloseTo(crossfade * (1 - 100 / 250), 6); // fade 0.6
    // Distinct per-node fades under one shared crossfade: the drawn ratio is the
    // fade ratio, so the crossfade cancels and the multiply is unambiguous.
    expect(leafOp / rootOp).toBeCloseTo(0.4 / 0.6, 6);
  });

  it('wakes the render loop while a node fade is in flight', () => {
    const catalog = makeTwoLevelCatalog();
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog }]);
    const state = makeState(renderer);
    const requestRender = vi.mocked(state.subsystems.scheduler.requestRender);
    const farView = makeNear0View(camAtPcVec(FAR_PC));
    const closeView = makeNear0View(camAtPcVec(CLOSE_PC));

    // Frame 1: snap (first paint) — nothing is mid-fade, so no wake.
    starCatalogLayer.draw(PASS_STUB, farView, makeCtx(camAtPcVec(FAR_PC), 0), state);
    expect(requestRender).not.toHaveBeenCalled();

    // Frame 2: the cut flips → nodes are mid-fade → the loop must keep ticking.
    starCatalogLayer.draw(PASS_STUB, closeView, makeCtx(camAtPcVec(CLOSE_PC), 50), state);
    expect(requestRender).toHaveBeenCalled();
  });
});
