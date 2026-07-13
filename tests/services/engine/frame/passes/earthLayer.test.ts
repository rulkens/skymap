/**
 * earthLayer — unit tests for the true-scale Earth content row.
 *
 * Like the other sphere-body layers, the load-bearing assertion is the f64 seam: the
 * layer MUST feed `composeBodyMvp` the slab's `Float64Array` view-projection
 * (`view.slab.vp`), NOT the f32-narrowed `view.vp` the other layers consume.
 * Earth sits ~1 AU ≈ 4.85e-12 Mpc from the render origin, a tiny number the
 * VP's large translation nearly cancels — resolving that cancellation in f32
 * (after the low-order bits are gone) would mis-place Earth by more than its
 * own radius. We pin it by identity: a mocked `composeBodyMvp` whose first
 * argument must `toBe(view.slab.vp)`, where the fixture's `slab.vp` is a
 * recognisable `Float64Array` and `vp` is a deliberately different
 * `Float32Array`.
 *
 * The layer also gates on TWO handles — the `earthRenderer` GPU handle and the
 * seeded `bodies.earth` record — so `enabled` is false until both are present,
 * AND on the shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC`).
 * This suite carries the representative executor-group check: above the gate
 * the whole `(foreground:0, NEAR0)` group must come back empty from the SAME
 * filter `executeFrame` uses, which is what lets the frame skip the
 * foreground render pass + its composite wholesale at galaxy zoom.
 */

import { describe, it, expect, vi } from 'vitest';

import { earthLayer } from '../../../../../src/services/engine/frame/passes/earthLayer';
import { CONTENT_LAYERS } from '../../../../../src/services/engine/frame/passes';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneBodies';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { EarthBody } from '../../../../../src/@types/scene/EarthBody';

// Mock composeBodyMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand the renderer a recognisable Float32Array. The
// real composition math is covered by composeBodyMvp's own tests.
vi.mock('../../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float32Array>(() => new Float32Array(16)),
}));
import { composeBodyMvp } from '../../../../../src/utils/camera/composeBodyMvp';

const composeMock = composeBodyMvp as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

// Bare ctx for the null-handle and draw cases: draw never reads ctx, and
// enabled's handle check must short-circuit BEFORE the ctx.cam read
// (renderFrame fixtures carry null handles and a bare ctx).
const CTX_STUB = {} as ReadyFrameContext;

// enabled reads only ctx.cam.distance beyond the handle checks.
function makeCtx(distance: number): ReadyFrameContext {
  return { cam: { distance } } as unknown as ReadyFrameContext;
}

// A camera comfortably inside the shared foreground gate.
const NEAR_CTX = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);

/**
 * A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so a first-arg identity check unambiguously reveals which one the
 * layer fed to composeBodyMvp. The f64 array carries recognisable non-zero
 * values; the f32 array is left as a distinct all-zero Float32Array.
 */
function makeNear0View(): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: f64Vp,
    originRelative: true,
    precision: 'f64',
  };
  return {
    slab,
    vp: f32Vp,
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
  };
}

/** State whose `earthRenderer` handle + `bodies.earth` record are both set. */
function makeState(earthRenderer: unknown, earth: EarthBody | null): EngineState {
  return {
    gpu: { earthRenderer },
    data: { bodies: { earth } },
  } as unknown as EngineState;
}

describe('earthLayer.enabled', () => {
  it('is false while earthRenderer is null and while bodies.earth is null; true with both set', () => {
    const renderer = { draw: vi.fn() };
    // Neither present. Bare ctx: the handle check short-circuits first.
    expect(earthLayer.enabled(makeState(null, null), CTX_STUB)).toBe(false);
    // Renderer only (camera inside the gate — the body is the missing gate).
    expect(earthLayer.enabled(makeState(renderer, null), NEAR_CTX)).toBe(false);
    // Body only. Bare ctx: the handle check short-circuits first.
    expect(earthLayer.enabled(makeState(null, SCENE_EARTH), CTX_STUB)).toBe(false);
    // Both present, camera inside the gate.
    expect(earthLayer.enabled(makeState(renderer, SCENE_EARTH), NEAR_CTX)).toBe(true);
  });

  it('is disabled beyond the foreground gate and enabled below it', () => {
    const state = makeState({ draw: vi.fn() }, SCENE_EARTH);
    // Below the gate → the handle + body gates decide (both pass).
    expect(earthLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2))).toBe(true);
    // At and above the gate → off, however present the handles are: Earth is
    // a deep-sub-pixel speck at the galactic centre.
    expect(earthLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toBe(false);
    expect(earthLayer.enabled(state, makeCtx(0.43))).toBe(false);
  });
});

describe('the (foreground:0, NEAR0) render group above the foreground gate', () => {
  it('empties above the gate and is non-empty below it (the wholesale-skip property)', () => {
    // The SAME group filter executeFrame's render step applies: (target, slab)
    // match + the layer's own enabled gate. An empty group means the executor
    // never opens the foreground render pass, and the untouched foreground:0
    // source then skips its composite too. Earth's handle + body are present;
    // the sibling handles are null (their handle gates short-circuit).
    const state = {
      gpu: { earthRenderer: { draw: vi.fn() }, starRenderer: null, planetRenderer: null },
      data: { bodies: { earth: SCENE_EARTH } },
    } as unknown as EngineState;
    const groupAt = (ctx: ReadyFrameContext) =>
      CONTENT_LAYERS.filter(
        (l) => l.target === 'foreground:0' && l.slab === NEAR0 && l.enabled(state, ctx),
      );

    // Below the gate: earth draws (its two gates pass), so the group is
    // non-empty and the foreground pass runs.
    expect(groupAt(makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2)).map((l) => l.name)).toEqual(['earth']);
    // Above the gate: EVERY foreground:0 layer is off — the group is empty
    // and the executor skips the pass + composite wholesale.
    expect(groupAt(makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toEqual([]);
    expect(groupAt(makeCtx(0.43))).toEqual([]);
  });
});

describe('earthLayer.draw', () => {
  it('draws the seeded earth via composeBodyMvp with the slab f64 vp', () => {
    composeMock.mockClear();
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeNear0View();
    const state = makeState({ draw: drawSpy }, SCENE_EARTH);

    earthLayer.draw(PASS_STUB, view, CTX_STUB, state);

    // Exactly one MVP composed for the single Earth body.
    expect(composeMock).toHaveBeenCalledTimes(1);
    const call = composeMock.mock.calls[0]!;
    // The load-bearing seam: first arg is the slab's Float64Array vp, NOT view.vp.
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Position, render origin, and the km→Mpc radius carried through.
    expect(call[1]).toBe(SCENE_EARTH.positionMpc);
    expect(call[2]).toBe(RENDER_ORIGIN_MPC);
    expect(call[3]).toBe(SCENE_EARTH.radiusKm * SCALE_UNITS.KM_TO_MPC);

    // The renderer receives the pass + the composed length-16 f32 MVP.
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [passArg, mvp] = drawSpy.mock.calls[0]! as [GPURenderPassEncoder, Float32Array];
    expect(passArg).toBe(PASS_STUB);
    expect(mvp).toBeInstanceOf(Float32Array);
    expect(mvp).toHaveLength(16);
  });

  it('is a no-op when the earthRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = makeState(null, SCENE_EARTH);
    expect(() => earthLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });

  it('is a no-op when bodies.earth is null (unseeded)', () => {
    const view = makeNear0View();
    const state = makeState({ draw: vi.fn() }, null);
    expect(() => earthLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
