/**
 * starSpheresLayer — unit tests for the near-partition star content row.
 *
 * Like `earthLayer`, the load-bearing assertion is the f64 seam: the layer
 * MUST feed `composeBodyMvp` the slab's `Float64Array` view-projection
 * (`view.slab.vp`), NOT the f32-narrowed `view.vp` the other layers consume.
 * A sphere-filling body placed against the VP's nearly-cancelling
 * translation would be misplaced by more than its radius if the
 * cancellation resolved in f32. We pin it by identity: a mocked
 * `composeBodyMvp` whose first argument must `toBe(view.slab.vp)`, where
 * the fixture's `slab.vp` is a recognisable `Float64Array` and `vp` is a
 * deliberately different `Float32Array`.
 *
 * The partition matters here too: only near stars (per `isNearStar` — the
 * Sun alone in the real seed) may draw, because `starRenderer` owns a
 * single non-dynamic uniform buffer (one draw per frame).
 */

import { describe, it, expect, vi } from 'vitest';

import { starSpheresLayer } from '../../../../../src/services/engine/frame/passes/starSpheresLayer';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneBodies';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StarBody } from '../../../../../src/@types/scene/StarBody';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Mock composeBodyMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand the renderer a recognisable Float32Array. The
// real composition math is covered by composeBodyMvp's own tests.
vi.mock('../../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float32Array>(() => new Float32Array(16)),
}));
import { composeBodyMvp } from '../../../../../src/utils/camera/composeBodyMvp';

const composeMock = composeBodyMvp as unknown as ReturnType<typeof vi.fn>;

const SUN = SCENE_STARS.find((star) => star.id === 'sun')!;

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
 * layer fed to composeBodyMvp.
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

/** State with a `starRenderer` handle and a seeded star list. */
function makeState(starRenderer: unknown, stars: readonly StarBody[]): EngineState {
  return {
    gpu: { starRenderer },
    data: { bodies: { stars } },
  } as unknown as EngineState;
}

describe('starSpheresLayer.enabled', () => {
  it('is false while starRenderer is null and while no near-partition star is seeded; true with both', () => {
    const renderer = { draw: vi.fn() };
    // Neither present. NOTE: the null-renderer case deliberately passes an
    // empty state.data — the handle check must short-circuit BEFORE the
    // bodies read (renderFrame fixtures carry no bodies bag).
    expect(
      starSpheresLayer.enabled({ gpu: { starRenderer: null } } as unknown as EngineState, CTX_STUB),
    ).toBe(false);
    // Renderer only — every seeded star is far-partition (Proxima et al).
    const farOnly = SCENE_STARS.filter((star) => star.id !== 'sun');
    expect(starSpheresLayer.enabled(makeState(renderer, farOnly), CTX_STUB)).toBe(false);
    // Renderer + the Sun (the near partition's one member).
    expect(starSpheresLayer.enabled(makeState(renderer, SCENE_STARS), CTX_STUB)).toBe(true);
  });
});

describe('starSpheresLayer.draw', () => {
  it('the Sun is drawn via composeBodyMvp with the slab f64 vp', () => {
    composeMock.mockClear();
    const drawSpy = vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3) => void>();
    const view = makeNear0View();
    const state = makeState({ draw: drawSpy }, SCENE_STARS);

    starSpheresLayer.draw(PASS_STUB, view, CTX_STUB, state);

    // Exactly one MVP composed — the Sun is the only near-partition star,
    // which is also the renderer's one-draw-per-frame precondition.
    expect(composeMock).toHaveBeenCalledTimes(1);
    const call = composeMock.mock.calls[0]!;
    // The load-bearing seam: first arg is the slab's Float64Array vp, NOT view.vp.
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Position, render origin, and the km→Mpc radius carried through.
    expect(call[1]).toBe(SUN.positionMpc);
    expect(call[2]).toBe(RENDER_ORIGIN_MPC);
    expect(call[3]).toBe(SUN.radiusKm * SCALE_UNITS.KM_TO_MPC);

    // The renderer receives the pass + the composed f32 MVP + the Sun's
    // spectral colour.
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [passArg, mvp, color] = drawSpy.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(mvp).toBeInstanceOf(Float32Array);
    expect(mvp).toHaveLength(16);
    expect(color).toBe(SUN.color);
  });

  it('is a no-op when the starRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = { gpu: { starRenderer: null } } as unknown as EngineState;
    expect(() => starSpheresLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
