/**
 * starSpheresPass — unit tests for the resolved-partition star content row.
 *
 * Like `earthPass`, the load-bearing assertion is the f64 seam: the layer
 * MUST feed `composeBodyMvp` the slab's `Float64Array` view-projection
 * (`view.slab.vp`), NOT the f32-narrowed `view.vp` the other layers consume.
 * A sphere-filling body placed against the VP's nearly-cancelling
 * translation would be misplaced by more than its radius if the
 * cancellation resolved in f32. We pin it by identity: a mocked
 * `composeBodyMvp` whose first argument must `toBe(view.slab.vp)`, where
 * the fixture's `slab.vp` is a recognisable `Float64Array` and `vp` is a
 * deliberately different `Float32Array`.
 *
 * The sort matters here too: the layer draws EXACTLY the seeded stars in the
 * `resolved` branch of core's scene-body sort — the stars whose apparent size
 * crosses their `resolvePx`, the Sun included (sub-resolve it demotes to a
 * point like any other star) — while `starPointsPass` draws the
 * complementary `unresolved` branch. The two layer suites
 * share the camera-half-an-AU-off-Sirius mixed fixture, so the sphere set
 * asserted here and the point set asserted there are disjoint and cover the
 * input (the structural XOR).
 */

import { describe, it, expect, vi } from 'vitest';

import { starSpheresPass } from '../../../../src/layers/starCatalog/passes/starSpheresPass';
import { seedIndexOfBody } from '../../../../src/utils/picking/seedIndexOfBody';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SEEDED_STAR_CATALOGS } from '../../../../src/data/bodies/seededStarCatalogs';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { Source } from '../../../../src/data/sources';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { PositionedSceneBody } from '../../../../src/@types/engine/frame/PositionedSceneBody';
import type { SceneBody } from '../../../../src/@types/scene/SceneBody';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// Mock composeBodyMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand the layer a recognisable Float64Array — real
// composeBodyMvp returns f64; the layer narrows its own copy at the GPU draw
// call. The real composition math is covered by composeBodyMvp's own tests.
vi.mock('../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float64Array>(() => new Float64Array(16)),
}));
import { composeBodyMvp } from '../../../../src/utils/camera/composeBodyMvp';

// The star entry's handed value with every catalog fully faded in.
const ALL_ON = { famousStar: 1, gaiaStars: 1, sStar: 1, sun: 1 } as const;

const composeMock = composeBodyMvp as unknown as ReturnType<typeof vi.fn>;

// The frame's scene bodies as core hands them: positioned at the snapshot instant,
// so a star's position IS its anchor's array, by reference, which is what lets the
// compose assertions below check the seam by identity.
const STATES = deriveBodyStates(CONST_J2000);
const positionedOf = (bodies: readonly SceneBody[]): readonly PositionedSceneBody[] =>
  bodies.map((body) => ({ body, positionMpc: STATES.get(body.id)!.positionMpc }));
const EVERY_SEEDED = positionedOf(Object.values(SEEDED_STAR_CATALOGS).flat());
const SUN_ONLY = positionedOf(SEEDED_STAR_CATALOGS.sun);
const starAt = (id: string) => EVERY_SEEDED.find((p) => p.body.id === id)!;

const SUN = starAt('sun');
const SIRIUS = starAt('sirius');

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

/**
 * The gate + partition inputs a layer reads off the frame context: the orbit
 * distance (the shared foreground gate reads `ctx.cam.distance`), the
 * absolute camera position, the vertical fov, and the viewport height.
 * 60° fov + 720-px viewport matches the SlabView fixture below. The orbit
 * distance is |camPos| — these fixtures orbit the heliocentric origin, so
 * the two coincide.
 */
function makeCtx(
  camPos: Readonly<Vec3>,
  sceneBodies: readonly PositionedSceneBody[] = EVERY_SEEDED,
): FrameView {
  return {
    snapshot: { simDays: CONST_J2000, sceneBodies },
    cam: { distance: Math.hypot(camPos[0], camPos[1], camPos[2]) },
    drawCamPos: camPos,
    canvasSize: { width: 1280, height: 720 },
    // The drawPick radius floor (`minPickRadiusMpc`) reads this pinhole
    // radian→pixel conversion: 720 / (2·tan(30°)).
    drawPxPerRad: 720 / (2 * Math.tan(Math.PI / 6)),
  } as unknown as FrameView;
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
  const slab: Slab = makeSlab({ vp: f64Vp });
  return {
    slab,
    vp: f32Vp,
    camPos,
    viewportPx: [1280, 720],
    window: { originPx: [0, 0], sizePx: [1280, 720] },
  };
}

function makeState(): EngineState {
  return { gpu: {} } as unknown as EngineState;
}

/** The Layer's runtime, carrying only the `starRenderer` this pass reads. */
function makeRuntime(starRenderer: unknown): StarCatalogRuntime {
  return { starRenderer } as unknown as StarCatalogRuntime;
}

// `enabled` never reads `view` — an arbitrary NEAR0 view satisfies the 3-arg
// signature for every gating case in this file.
const VIEW_STUB = makeNear0View([0, 0, 0]);

describe('starSpheresPass.enabled', () => {
  it('is false while no star resolves; true once one does', () => {
    const pass = starSpheresPass(makeRuntime({ draw: vi.fn() }));
    // Below-gate camera: every star — the Sun included — is
    // sub-pixel at 5 kpc, so the spheres branch is empty (the Sun demotes to
    // a point rather than holding a row alive with an invisible sphere).
    const nearCtx = makeCtx(NEAR_FIELD_CAM);
    expect(pass.enabled(makeState(), nearCtx, VIEW_STUB, ALL_ON)).toBe(false);
    // A camera half an AU off the Sun: the Sun resolves and the
    // spheres branch is non-empty.
    const sunCtx = makeCtx(halfAuFrom(SUN.positionMpc));
    expect(pass.enabled(makeState(), sunCtx, VIEW_STUB, ALL_ON)).toBe(true);
  });

  it('finds its stars by their seed refs: a resolved planet alone keeps it off', () => {
    const pass = starSpheresPass(makeRuntime({ draw: vi.fn() }));
    const [mars] = positionedOf(SCENE_PLANETS.filter((p) => p.id === 'mars'));
    const ctx = makeCtx(halfAuFrom(mars!.positionMpc), [mars!]);
    expect(pass.enabled(makeState(), ctx, VIEW_STUB, ALL_ON)).toBe(false);
  });

  it('is disabled beyond the foreground gate', () => {
    // At galaxy scale the Sun sphere is a deep-sub-pixel speck: the shared
    // gate turns the row off before the partition is computed, so the
    // (foreground:0, NEAR0) step can be skipped wholesale.
    const pass = starSpheresPass(makeRuntime({ draw: vi.fn() }));
    const state = makeState();
    expect(pass.enabled(state, makeCtx([0, 0, 0.43]), VIEW_STUB, ALL_ON)).toBe(false);
    expect(
      pass.enabled(state, makeCtx([0, 0, FOREGROUND_MAX_DISTANCE_MPC]), VIEW_STUB, ALL_ON),
    ).toBe(false);
  });
});

describe('starSpheresPass.draw', () => {
  it('the Sun is drawn via composeBodyMvp with the slab f64 vp', () => {
    composeMock.mockClear();
    const drawSpy = vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3) => void>();
    // Camera half an AU off the Sun: it resolves while every other star stays
    // parsecs away and sub-pixel — exactly one sphere draw, matching
    // starRenderer's one-draw-per-frame uniform layout.
    const camPos: Vec3 = halfAuFrom(SUN.positionMpc);
    const view = makeNear0View(camPos);
    const pass = starSpheresPass(makeRuntime({ draw: drawSpy }));

    pass.draw!(PASS_STUB, view, makeCtx(camPos), makeState(), ALL_ON);

    expect(composeMock).toHaveBeenCalledTimes(1);
    const call = composeMock.mock.calls[0]!;
    // The load-bearing seam: first arg is the slab's Float64Array vp, NOT view.vp.
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Position, render origin, and the m→Mpc radius carried through.
    expect(call[1]).toBe(SUN.positionMpc);
    expect(call[2]).toBe(RENDER_ORIGIN_MPC);
    expect(call[3]).toBe(SEEDED_STAR_CATALOGS.sun[0]!.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC);
    // A star is a rotation-invariant emissive sphere — it forwards the identity.
    expect(call[4]).toBe(IDENTITY_MAT3);

    // The renderer receives the pass + the composed f32 MVP + the Sun's
    // blackbody colour.
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [passArg, mvp, color] = drawSpy.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(mvp).toBeInstanceOf(Float32Array);
    expect(mvp).toHaveLength(16);
    expect(color).toBe(SEEDED_STAR_CATALOGS.sun[0]!.color);
  });

  it("a sphere draws with its catalog's handed value", () => {
    const drawSpy = vi.fn();
    const camPos = halfAuFrom(SUN.positionMpc);
    const pass = starSpheresPass(makeRuntime({ draw: drawSpy }));

    pass.draw!(PASS_STUB, makeNear0View(camPos), makeCtx(camPos), makeState(), {
      ...ALL_ON,
      sun: 0.5,
    });

    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]![3]).toBe(0.5);
  });

  it('a famous star’s drawn position comes from the snapshot', () => {
    composeMock.mockClear();
    // The star record carries no position at all, so the only place the drawn
    // one can come from is the frame's body snapshot. Pinned by IDENTITY: the
    // array `composeBodyMvp` receives must be the very `BodyState.positionMpc`
    // the snapshot holds for Sirius — a re-derivation, a copy, or a lookup
    // against the wrong id would all miss.
    const camPos = halfAuFrom(SIRIUS.positionMpc);
    const pass = starSpheresPass(makeRuntime({ draw: vi.fn() }));

    pass.draw!(PASS_STUB, makeNear0View(camPos), makeCtx(camPos), makeState(), ALL_ON);

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock.mock.calls[0]![1]).toBe(
      deriveBodyStates(CONST_J2000).get('sirius')!.positionMpc,
    );
  });

  it('starSpheresPass draws only the resolved stars', () => {
    composeMock.mockClear();
    const drawSpy = vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3) => void>();
    // Mixed fixture, camera half an AU off Sirius: only Sirius resolves
    // (1.71 R☉). The Sun and Proxima stay parsecs away, sub-pixel, and belong
    // to starPointsPass — the complementary set its suite asserts over this
    // same fixture (the structural XOR).
    const camPos = halfAuFrom(SIRIUS.positionMpc);
    const view = makeNear0View(camPos);
    const pass = starSpheresPass(makeRuntime({ draw: drawSpy }));

    pass.draw!(PASS_STUB, view, makeCtx(camPos), makeState(), ALL_ON);

    // Exactly the resolved star composed, by identity.
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock.mock.calls.map((c) => c[1])).toEqual([SIRIUS.positionMpc]);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls.map((c) => c[2])).toEqual([
      SCENE_STARS.find((star) => star.id === 'sirius')!.color,
    ]);
  });

  it('draws only the stars core admitted — never a neighbour it left out', () => {
    composeMock.mockClear();
    // Camera half an AU off Sirius, which WOULD resolve — but core admitted the
    // Sun alone. The Sun is parsecs away from this camera (sub-pixel), so nothing
    // resolves: no sphere is composed.
    const offSiriusPass = starSpheresPass(makeRuntime({ draw: vi.fn() }));
    offSiriusPass.draw!(
      PASS_STUB,
      makeNear0View(halfAuFrom(SIRIUS.positionMpc)),
      makeCtx(halfAuFrom(SIRIUS.positionMpc), SUN_ONLY),
      makeState(),
      ALL_ON,
    );
    expect(composeMock).not.toHaveBeenCalled();

    // Camera half an AU off the Sun: it resolves and is the sole composed sphere.
    composeMock.mockClear();
    const drawSpy = vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3) => void>();
    const onSunPass = starSpheresPass(makeRuntime({ draw: drawSpy }));
    onSunPass.draw!(
      PASS_STUB,
      makeNear0View(halfAuFrom(SUN.positionMpc)),
      makeCtx(halfAuFrom(SUN.positionMpc), SUN_ONLY),
      makeState(),
      ALL_ON,
    );
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock.mock.calls[0]![1]).toBe(SUN.positionMpc);
  });
});

// §8.1 regression — the pick id carries the body's STABLE SCENE_STARS seed
// index, NOT its slot in the frame's camera-dependent sphere partition. This
// bites at the real `drawPick` call site: a `bodyPickRenderer` stub captures
// the packedId Sirius is stamped with in a frame where earlier seeds are culled
// to sub-pixel points, so Sirius is the SOLE resolved sphere — slot 0 of the
// drawn list. If the layer ever
// stamped that pack-loop slot (the `@builtin(instance_index)` bug §8.1 guards),
// the decoded index would be 0 and Sirius' saved selection would rename the
// instant a sibling entered or left the sort. The helper's own
// determinism has plain unit tests in `seedIndexOfBody.test.ts`; this proves
// the call site actually feeds it the seed table.
describe('starSpheresPass.drawPick', () => {
  it('stamps each sphere’s SCENE_STARS seed index, not its slot in the culled sphere partition', () => {
    // Camera half an AU off Sirius: only Sirius resolves to a sphere, every
    // other seed staying parsecs away and sub-pixel (the same fixture the
    // `draw` suite above pins to one composed sphere). Sirius therefore draws
    // at slot 0 of the resolved sphere list, but its pick id must decode to its
    // SCENE_STARS seed index.
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
    const state = { gpu: { bodyPickRenderer } } as unknown as EngineState;
    const pass = starSpheresPass(makeRuntime({ draw: vi.fn() }));

    pass.drawPick!(PASS_STUB, view, makeCtx(camPos), state, ALL_ON);

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
