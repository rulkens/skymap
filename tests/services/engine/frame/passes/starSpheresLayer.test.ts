/**
 * starSpheresLayer — unit tests for the resolved-partition star content row.
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
 * The partition matters here too: the layer draws EXACTLY the `spheres`
 * branch of `partitionStarsByResolution` — the stars whose apparent size
 * crosses `STAR_RESOLVE_PX`, the Sun included (sub-resolve it demotes to a
 * point like any other star) — while `starPointsLayer` draws the
 * complementary `points` branch of the same call. The two layer suites
 * share the camera-half-an-AU-off-Proxima mixed fixture, so the sphere set
 * asserted here and the point set asserted there are disjoint and cover the
 * input (the structural XOR).
 */

import { describe, it, expect, vi } from 'vitest';

import { starSpheresLayer } from '../../../../../src/services/engine/frame/passes/starSpheresLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneStars';
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
const PROXIMA = SCENE_STARS.find((star) => star.id === 'proxima-centauri')!;
const SIRIUS = SCENE_STARS.find((star) => star.id === 'sirius')!;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

// Bare ctx for the null-renderer cases only: the handle check must
// short-circuit BEFORE any ctx (or state.data) read.
const CTX_STUB = {} as ReadyFrameContext;

/**
 * The gate + partition inputs a layer reads off the frame context: the orbit
 * distance (the shared foreground gate reads `ctx.cam.distance`), the
 * absolute camera position, the vertical fov, and the viewport height.
 * 60° fov + 720-px viewport matches the SlabView fixture below. The orbit
 * distance is |camPos| — these fixtures orbit the heliocentric origin, so
 * the two coincide.
 */
function makeCtx(camPos: Readonly<Vec3>): ReadyFrameContext {
  return {
    cam: { distance: Math.hypot(camPos[0], camPos[1], camPos[2]) },
    drawCamPos: camPos,
    fovYRad: Math.PI / 3,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as ReadyFrameContext;
}

// A below-gate camera 5 kpc down +z: inside FOREGROUND_MAX_DISTANCE_MPC
// (~10 kpc), so the distance gate passes — yet still parsecs beyond every
// seeded star (the Sun included), so nothing resolves to a sphere.
const NEAR_FIELD_CAM: Readonly<Vec3> = [0, 0, 5e-3];

/**
 * A camera half an AU from the given position: a solar-diameter sphere at
 * that range subtends ~12 px in this fixture's 720-px, 60°-fov viewport —
 * above STAR_RESOLVE_PX — while stars parsecs away stay sub-pixel.
 */
function halfAuFrom(positionMpc: Readonly<Vec3>): Vec3 {
  return [positionMpc[0] + 0.5 * SCALE_UNITS.AU_TO_MPC, positionMpc[1], positionMpc[2]];
}

/**
 * A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so a first-arg identity check unambiguously reveals which one the
 * layer fed to composeBodyMvp.
 */
function makeNear0View(camPos: Vec3): SlabView {
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
    camPos,
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
  it('is false while starRenderer is null and while no star resolves; true once one does', () => {
    const renderer = { draw: vi.fn() };
    // Null handle. NOTE: deliberately an empty state.data AND a bare ctx —
    // the handle check must short-circuit BEFORE either is touched
    // (renderFrame fixtures carry null handles and no bodies bag).
    expect(
      starSpheresLayer.enabled({ gpu: { starRenderer: null } } as unknown as EngineState, CTX_STUB),
    ).toBe(false);
    // Renderer + below-gate camera: every star — the Sun included — is
    // sub-pixel at 5 kpc, so the spheres branch is empty (the Sun demotes to
    // a point rather than holding a row alive with an invisible sphere).
    const nearCtx = makeCtx(NEAR_FIELD_CAM);
    expect(starSpheresLayer.enabled(makeState(renderer, SCENE_STARS), nearCtx)).toBe(false);
    // Renderer + a camera half an AU off the Sun: the Sun resolves and the
    // spheres branch is non-empty.
    const sunCtx = makeCtx(halfAuFrom(SUN.positionMpc));
    expect(starSpheresLayer.enabled(makeState(renderer, SCENE_STARS), sunCtx)).toBe(true);
  });

  it('is disabled beyond the foreground gate', () => {
    // At galaxy scale the Sun sphere is a deep-sub-pixel speck: the shared
    // gate turns the row off before the partition is computed, so the
    // (foreground:0, NEAR0) step can be skipped wholesale.
    const state = makeState({ draw: vi.fn() }, SCENE_STARS);
    expect(starSpheresLayer.enabled(state, makeCtx([0, 0, 0.43]))).toBe(false);
    expect(starSpheresLayer.enabled(state, makeCtx([0, 0, FOREGROUND_MAX_DISTANCE_MPC]))).toBe(
      false,
    );
  });
});

describe('starSpheresLayer.draw', () => {
  it('the Sun is drawn via composeBodyMvp with the slab f64 vp', () => {
    composeMock.mockClear();
    const drawSpy = vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3) => void>();
    // Camera half an AU off the Sun: it resolves while every other star stays
    // parsecs away and sub-pixel — exactly one sphere draw, matching
    // starRenderer's one-draw-per-frame uniform layout.
    const camPos: Vec3 = halfAuFrom(SUN.positionMpc);
    const view = makeNear0View(camPos);
    const state = makeState({ draw: drawSpy }, SCENE_STARS);

    starSpheresLayer.draw(PASS_STUB, view, makeCtx(camPos), state);

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

  it('starSpheresLayer draws only the resolved stars', () => {
    composeMock.mockClear();
    const drawSpy = vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3) => void>();
    // Mixed fixture, camera half an AU off Proxima: only Proxima resolves.
    // The Sun (1.3 pc away, sub-pixel) and Sirius stay points and belong to
    // starPointsLayer — the complementary set its suite asserts over this
    // same fixture (the structural XOR).
    const camPos = halfAuFrom(PROXIMA.positionMpc);
    const view = makeNear0View(camPos);
    const state = makeState({ draw: drawSpy }, [SUN, PROXIMA, SIRIUS]);

    starSpheresLayer.draw(PASS_STUB, view, makeCtx(camPos), state);

    // Exactly the resolved star composed, by identity.
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock.mock.calls.map((c) => c[1])).toEqual([PROXIMA.positionMpc]);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls.map((c) => c[2])).toEqual([PROXIMA.color]);
  });

  it('is a no-op when the starRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View([0, 0, 5]);
    const state = { gpu: { starRenderer: null } } as unknown as EngineState;
    expect(() => starSpheresLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
