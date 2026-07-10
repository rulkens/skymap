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
 * seeded `bodies.earth` record — so `enabled` is false until both are present.
 */

import { describe, it, expect, vi } from 'vitest';

import { earthLayer } from '../../../../../src/services/engine/frame/passes/earthLayer';
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

// ctx is unread by this layer (it composes from view.slab.vp + the
// RENDER_ORIGIN_MPC constant), so a bare cast satisfies the signature.
const CTX_STUB = {} as ReadyFrameContext;

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
    // Neither present.
    expect(earthLayer.enabled(makeState(null, null), CTX_STUB)).toBe(false);
    // Renderer only.
    expect(earthLayer.enabled(makeState(renderer, null), CTX_STUB)).toBe(false);
    // Body only.
    expect(earthLayer.enabled(makeState(null, SCENE_EARTH), CTX_STUB)).toBe(false);
    // Both present.
    expect(earthLayer.enabled(makeState(renderer, SCENE_EARTH), CTX_STUB)).toBe(true);
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
