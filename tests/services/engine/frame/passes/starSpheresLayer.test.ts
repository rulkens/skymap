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
 * share the camera-half-an-AU-off-Sirius mixed fixture, so the sphere set
 * asserted here and the point set asserted there are disjoint and cover the
 * input (the structural XOR).
 */

import { describe, it, expect, vi } from 'vitest';

import { starSpheresLayer } from '../../../../../src/services/engine/frame/passes/starSpheresLayer';
import { seedIndexOfBody } from '../../../../../src/services/engine/frame/passes/seedIndexOfBody';
import { IDENTITY_MAT3 } from '../../../../../src/utils/math/identityMat3';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneStars';
import { SCENE_ANCHORS } from '../../../../../src/data/bodies/sceneAnchors';
import { makeBodyItems } from '../../../../fixtures/makeBodyItems';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/sources';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StarBody } from '../../../../../src/@types/scene/StarBody';
import type { PositionedStar } from '../../../../../src/@types/scene/PositionedStar';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Mock composeBodyMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand the layer a recognisable Float64Array — real
// composeBodyMvp returns f64; the layer narrows its own copy at the GPU draw
// call. The real composition math is covered by composeBodyMvp's own tests.
vi.mock('../../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float64Array>(() => new Float64Array(16)),
}));
import { composeBodyMvp } from '../../../../../src/utils/camera/composeBodyMvp';

const composeMock = composeBodyMvp as unknown as ReturnType<typeof vi.fn>;

// The record + the position this frame resolves for it — the pairing
// `positionedVisibleStars` builds. A star is an anchor, so the resolved
// position IS the anchor's array, by reference, which is what lets the compose
// assertions below check the seam by identity.
const ANCHOR_POS = new Map(SCENE_ANCHORS.map((anchor) => [anchor.id, anchor.positionMpc]));
const positioned = (id: string): PositionedStar => {
  const star = SCENE_STARS.find((s) => s.id === id)!;
  return { ...star, positionMpc: ANCHOR_POS.get(id)! };
};

const SUN = positioned('sun');
const PROXIMA = positioned('proxima-centauri');
const SIRIUS = positioned('sirius');

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
    // The drawPick radius floor (`minPickRadiusMpc`) reads this pinhole
    // radian→pixel conversion: 720 / (2·tan(30°)).
    drawPxPerRad: 720 / (2 * Math.tan(Math.PI / 6)),
    // The instant the star layers resolve their positions at; a star anchor is
    // static, so any instant gives the same roster.
    simDays: CONST_J2000,
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
    frame: { kind: 'world-mpc', originRelative: true },
    precision: 'f64',
    reversedZ: false,
  };
  return {
    slab,
    vp: f32Vp,
    camPos,
    viewportPx: [1280, 720],
  };
}

/** State with a `starRenderer` handle and a seeded star list. */
function makeState(
  starRenderer: unknown,
  stars: readonly StarBody[],
  famousStarMapEnabled = true,
): EngineState {
  return {
    gpu: { starRenderer },
    data: { bodies: { stars } },
    // The cluster master is on: `visibleStars` requires it AND the row's own
    // bit, so a fixture that omitted it would silently drive the Sun-alone path.
    settings: {
      starCatalogs: { enabled: true, items: { famousStar: { enabled: famousStarMapEnabled } } },
      // The Sun and the S-stars each answer to their own body row, so
      // `visibleStars` reads them here rather than exempting ids from the map's
      // gate. Derived from BODY_IDS: a missing row throws inside the gate.
      bodies: { items: makeBodyItems() },
    },
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
    // Position, render origin, and the m→Mpc radius carried through.
    expect(call[1]).toBe(SUN.positionMpc);
    expect(call[2]).toBe(RENDER_ORIGIN_MPC);
    expect(call[3]).toBe(SUN.radiusM * SCALE_UNITS.M_TO_MPC);
    // A star is a rotation-invariant emissive sphere — it forwards the identity.
    expect(call[4]).toBe(IDENTITY_MAT3);

    // The renderer receives the pass + the composed f32 MVP + the Sun's
    // blackbody colour.
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [passArg, mvp, color] = drawSpy.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(mvp).toBeInstanceOf(Float32Array);
    expect(mvp).toHaveLength(16);
    expect(color).toBe(SUN.color);
  });

  it('a famous star’s drawn position comes from the snapshot', () => {
    composeMock.mockClear();
    // The star record carries no position at all, so the only place the drawn
    // one can come from is the frame's body snapshot. Pinned by IDENTITY: the
    // array `composeBodyMvp` receives must be the very `BodyState.positionMpc`
    // the snapshot holds for Sirius — a re-derivation, a copy, or a lookup
    // against the wrong id would all miss.
    const camPos = halfAuFrom(SIRIUS.positionMpc);
    const state = makeState({ draw: vi.fn() }, [SUN, PROXIMA, SIRIUS]);

    starSpheresLayer.draw(PASS_STUB, makeNear0View(camPos), makeCtx(camPos), state);

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock.mock.calls[0]![1]).toBe(
      deriveBodyStates(CONST_J2000).get('sirius')!.positionMpc,
    );
  });

  it('starSpheresLayer draws only the resolved stars', () => {
    composeMock.mockClear();
    const drawSpy = vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3) => void>();
    // Mixed fixture, camera half an AU off Sirius: only Sirius resolves
    // (1.71 R☉). The Sun and Proxima stay parsecs away, sub-pixel, and belong
    // to starPointsLayer — the complementary set its suite asserts over this
    // same fixture (the structural XOR).
    const camPos = halfAuFrom(SIRIUS.positionMpc);
    const view = makeNear0View(camPos);
    const state = makeState({ draw: drawSpy }, [SUN, PROXIMA, SIRIUS]);

    starSpheresLayer.draw(PASS_STUB, view, makeCtx(camPos), state);

    // Exactly the resolved star composed, by identity.
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock.mock.calls.map((c) => c[1])).toEqual([SIRIUS.positionMpc]);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls.map((c) => c[2])).toEqual([SIRIUS.color]);
  });

  it('with the famous-star map gate off, only the Sun can resolve — never a neighbour', () => {
    composeMock.mockClear();
    // Camera half an AU off Sirius, which WOULD resolve — but the famous-star
    // row is OFF, so the layer sees the Sun alone. The Sun is parsecs away from
    // this camera (sub-pixel), so nothing resolves: no sphere is composed.
    const offSirius = makeState({ draw: vi.fn() }, [SUN, PROXIMA, SIRIUS], false);
    starSpheresLayer.draw(
      PASS_STUB,
      makeNear0View(halfAuFrom(SIRIUS.positionMpc)),
      makeCtx(halfAuFrom(SIRIUS.positionMpc)),
      offSirius,
    );
    expect(composeMock).not.toHaveBeenCalled();

    // Camera half an AU off the Sun with the gate still off: the Sun answers to
    // its own body row, so it resolves and is the sole composed sphere — the map
    // is muted, the descent's aim point kept.
    composeMock.mockClear();
    const drawSpy = vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3) => void>();
    const onSun = makeState({ draw: drawSpy }, [SUN, PROXIMA, SIRIUS], false);
    starSpheresLayer.draw(
      PASS_STUB,
      makeNear0View(halfAuFrom(SUN.positionMpc)),
      makeCtx(halfAuFrom(SUN.positionMpc)),
      onSun,
    );
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock.mock.calls[0]![1]).toBe(SUN.positionMpc);
  });

  it('is a no-op when the starRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View([0, 0, 5]);
    const state = { gpu: { starRenderer: null } } as unknown as EngineState;
    expect(() => starSpheresLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});

// §8.1 regression — the pick id carries the body's STABLE SCENE_STARS seed
// index, NOT its slot in the frame's camera-dependent sphere partition. This
// bites at the real `drawPick` call site: a `bodyPickRenderer` stub captures
// the packedId Sirius is stamped with in a frame where earlier seeds (the Sun
// at seed 0, Proxima at seed 1) are culled to sub-pixel points, so Sirius is
// the SOLE resolved sphere — slot 0 of the drawn list. If the layer ever
// stamped that pack-loop slot (the `@builtin(instance_index)` bug §8.1 guards),
// the decoded index would be 0 and Sirius' saved selection would rename the
// instant a sibling entered or left the partition. The helper's own
// determinism has plain unit tests in `seedIndexOfBody.test.ts`; this proves
// the call site actually feeds it the seed table.
describe('starSpheresLayer.drawPick', () => {
  it('stamps each sphere’s SCENE_STARS seed index, not its slot in the culled sphere partition', () => {
    // Mixed roster [Sun, Proxima, Sirius], camera half an AU off Sirius: only
    // Sirius (SCENE_STARS index 6) resolves to a sphere — the Sun (seed 0) and
    // Proxima (seed 1) stay parsecs away and sub-pixel (the same fixture the
    // `draw` suite above pins to one composed sphere). Sirius therefore draws
    // at slot 0 of the resolved sphere list, but its pick id must decode to
    // seed index 6.
    const captured: number[] = [];
    const bodyPickRenderer = {
      label: 'bodyPickRenderer',
      drawSphere: vi.fn((_pass: GPURenderPassEncoder, args: { packedId: number }) =>
        captured.push(args.packedId),
      ),
      drawPoints: vi.fn(),
      destroy: vi.fn(),
    };
    const camPos = halfAuFrom(SIRIUS.positionMpc);
    const view = makeNear0View(camPos);
    const state = {
      gpu: { bodyPickRenderer },
      data: { bodies: { stars: [SUN, PROXIMA, SIRIUS] } },
      settings: {
        starCatalogs: { enabled: true, items: { famousStar: { enabled: true } } },
        bodies: { items: makeBodyItems() },
      },
    } as unknown as EngineState;

    starSpheresLayer.drawPick!(PASS_STUB, view, makeCtx(camPos), state);

    // Exactly one sphere pick recorded — only Sirius resolved.
    expect(bodyPickRenderer.drawSphere).toHaveBeenCalledTimes(1);

    const decoded = unpackPick(captured[0]!)!;
    const seedIndex = seedIndexOfBody('sirius', SCENE_STARS);
    // The durable identity: Sirius' SCENE_STARS row, decoded straight back.
    expect(decoded.sourceCode).toBe(Source.FamousStar);
    expect(decoded.localIdx).toBe(seedIndex);
    // ...and that seed index is NOT Sirius' slot in the drawn sphere list (0).
    // Stamping the pack-loop slot would decode to 0, aliasing the first seed.
    expect(seedIndex).toBeGreaterThan(0);
    expect(decoded.localIdx).not.toBe(0);
  });
});
