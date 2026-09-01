/**
 * frameContext — unit tests for the per-frame derived snapshot.
 *
 * `deriveFrameContext` receives an already-produced `CameraPose`, the
 * `FramedCameraPose` (`arm`) it was resolved from, a `CameraProjection`, and
 * the frame's two orientation bases (`poseBasis`, `upBasis` — the engine
 * Resources), assembles the full `OrbitCamera` via `assembleOrbitCamera`, and
 * pre-computes the view-projection matrix, camera-position tuple, and
 * pixel-per-radian scalar. These tests pin both halves: the branching shape
 * (ready vs not-ready) and the arithmetic. They use the SAME value for both
 * basis arguments (`BASIS`) throughout — this file exercises the assembly
 * arithmetic, not the poseBasis/upBasis split itself, which
 * `runFrame.test.ts`'s orientation-frame-roll suite covers. Every fixture
 * below passes `arm` as the absolute arm wrapping the same `pose` — the last
 * two describe blocks are the only ones that construct a body arm, to
 * exercise the pose-provider seam (spec §5.2, Task 14).
 *
 * The threaded-pose variant (binding decision 1) means `deriveFrameContext`
 * does NOT re-call `runCameraDrivers` internally; it only calls
 * `assembleOrbitCamera(pose, projection, poseBasis, upBasis)` +
 * `computeViewProj`. The `cam` on the ready context is the assembled camera,
 * NOT `state.cam`.
 *
 * Tests also verify the bootstrap gate still works (cam=null → not-ready) even
 * though the rendered camera comes from the assembled pose, not `state.cam`.
 */

import { describe, it, expect, vi } from 'vitest';

// Wraps the REAL `deriveSlabs` in a spy so this file's identity test can
// assert `deriveFrameContext` fed it the SAME `bodyPose` closure it forwards
// onto `ReadyFrameContext.bodyPose` — the branch's central seam (six layer
// headers assert it; nothing else in the suite can fail if a refactor mints a
// second closure). Every other test in this file calls the real
// implementation through the spy, so their assertions are unaffected.
vi.mock('../../../../src/services/engine/frame/slabs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/engine/frame/slabs')>();
  return { ...actual, deriveSlabs: vi.fn(actual.deriveSlabs) };
});

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { BodyFixedPose } from '../../../../src/@types/camera/BodyFixedPose';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { computeViewProj } from '../../../../src/utils/camera/computeViewProj';
import { deriveSlabs, NEAR0, COSMO } from '../../../../src/services/engine/frame/slabs';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { toBodyArm } from '../../../../src/services/engine/camera/poseFrameConversion';
import { bodyRelativePose } from '../../../../src/services/engine/camera/bodyRelativePose';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { mat3FromColumns } from '../../../../src/utils/math/mat3FromColumns';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';

const RESTING_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
const PROJECTION: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };
// The absolute arm carrying `RESTING_POSE` — every fixture in this file predates
// Task 14 and exercised only the absolute arm, so this reproduces that fixture
// as a `FramedCameraPose` rather than changing what any test's `pose` means.
const RESTING_ARM: FramedCameraPose = absoluteArm(RESTING_POSE);

// Identity basis: the frame-local decode is already world space, so every case
// below reproduces the pre-feature (basis-free) geometry exactly.
const BASIS: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Build an `EngineState`-shaped fixture with the guard fields
 * (`cam`, `gpu.galaxyPointRenderer`, `gpu.renderTargets`, `gpu.galaxyPickRenderer`,
 * `gpu.compositor`, `subsystems.texturedDisks`) populated by default.
 * Each test can null any one to exercise the not-ready branch.
 *
 * `state.cam` is only used by the `isEngineReady` bootstrap gate (non-null
 * check); the rendered camera comes from
 * `assembleOrbitCamera(pose, projection, poseBasis, upBasis)` passed as
 * arguments.
 */
function makeState(
  overrides: {
    cam?: OrbitCamera | null;
    galaxyPointRenderer?: unknown;
    renderTargets?: unknown;
    galaxyPickRenderer?: unknown;
    compositor?: unknown;
    texturedDisks?: unknown;
  } = {},
): EngineState {
  const cam =
    overrides.cam === undefined
      ? ({
          target: [0, 0, 0],
          yaw: 0,
          pitch: 0,
          distance: 100,
          position: new Float32Array(3),
        } as unknown as OrbitCamera)
      : overrides.cam;
  const galaxyPointRenderer =
    overrides.galaxyPointRenderer === undefined ? ({} as unknown) : overrides.galaxyPointRenderer;
  const renderTargets =
    overrides.renderTargets === undefined ? ({} as unknown) : overrides.renderTargets;
  const galaxyPickRenderer =
    overrides.galaxyPickRenderer === undefined ? ({} as unknown) : overrides.galaxyPickRenderer;
  const compositor = overrides.compositor === undefined ? ({} as unknown) : overrides.compositor;
  const texturedDisks =
    overrides.texturedDisks === undefined ? ({} as unknown) : overrides.texturedDisks;
  return {
    cam,
    gpu: { galaxyPointRenderer, renderTargets, galaxyPickRenderer, compositor },
    subsystems: { texturedDisks },
    // No focused pivot in these fixtures — `deriveSlabs` gets `pivotRadiusMpc:
    // null`, reproducing the pre-feature (raw cam.distance) near-field bracket
    // every arithmetic assertion below was written against.
    selectionRows: { hover: null, select: null, focus: null },
    // No seeded bodies/stars — `visibleSlabBodies` and `visibleStars` (both
    // read unconditionally past the ready gate now) get an empty registry, so
    // every fixture below stays a 2-row (NEAR0+COSMO) slab table, matching
    // what every assertion in this file was written against.
    data: { bodies: { earth: null, planets: [], stars: [] } },
    settings: {
      starCatalogs: { enabled: false, items: { famousStar: { enabled: false } } },
      bodies: { items: { sun: { enabled: false }, 's-star': { enabled: false } } },
    },
  } as unknown as EngineState;
}

function makeCanvas(width = 1920, height = 1080): HTMLCanvasElement {
  return { width, height } as unknown as HTMLCanvasElement;
}

describe('deriveFrameContext — not-ready branch', () => {
  it('returns isReady:false when state.cam is null', () => {
    const ctx = deriveFrameContext(
      makeState({ cam: null }),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when gpu.galaxyPointRenderer is null', () => {
    const ctx = deriveFrameContext(
      makeState({ galaxyPointRenderer: null }),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when gpu.renderTargets is null', () => {
    const ctx = deriveFrameContext(
      makeState({ renderTargets: null }),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when subsystems.texturedDisks is null', () => {
    const ctx = deriveFrameContext(
      makeState({ texturedDisks: null }),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(false);
  });
});

describe('deriveFrameContext — ready branch', () => {
  it('assembles ctx.cam from pose + projection (not from state.cam)', () => {
    const pose: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
    const projection: CameraProjection = { fovYRad: 1.2, aspect: 2, near: 0.01, far: 5000 };
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      pose,
      absoluteArm(pose),
      projection,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    // ctx.cam must reflect the pose and projection.
    expect(ctx.cam.fovYRad).toBe(1.2);
    expect(ctx.cam.aspect).toBe(2);
    expect(ctx.cam.distance).toBe(50);
    expect(ctx.cam.yaw).toBeCloseTo(0.5);
    expect(ctx.cam.pitch).toBeCloseTo(0.1);
  });

  it('ctx.cam.fovYRad === projection.fovYRad (not from state.cam.fovYRad)', () => {
    // The projection Resource is the source of fovYRad; state.cam.fovYRad is
    // only the drag register bootstrap value and is never read for rendering.
    const projection: CameraProjection = { fovYRad: 0.9, aspect: 1, near: 0.1, far: 1000 };
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      projection,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.cam.fovYRad).toBe(0.9);
  });

  it('drawPxPerRad uses projection.fovYRad', () => {
    const projection: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };
    const canvas = makeCanvas(1920, 1080);
    const ctx = deriveFrameContext(
      makeState(),
      canvas,
      RESTING_POSE,
      RESTING_ARM,
      projection,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    // pxPerRad = height / (2 * tan(fovY / 2))
    const expected = 1080 / (2 * Math.tan(0.5));
    expect(ctx.drawPxPerRad).toBeCloseTo(expected, 6);
  });

  it('ctx.vp matches computeViewProj(assembleOrbitCamera(pose, projection, poseBasis, upBasis))', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      pose,
      absoluteArm(pose),
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    const expected = computeViewProj(assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS));
    expect(Array.from(ctx.vp)).toEqual(Array.from(expected));
  });

  it('populates ctx.slabs from deriveSlabs(cam, vp) — the single per-frame derivation', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      pose,
      absoluteArm(pose),
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    const cam = assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS);
    // The fixture seeds no bodies/stars, so every new deriveSlabs input beyond
    // cam/cosmoVp/pivotRadiusMpc is inert (empty registry, no star spheres) —
    // matching what `deriveFrameContext` itself derives from `makeState()`.
    const expected = deriveSlabs({
      cam,
      cosmoVp: computeViewProj(cam),
      pivotRadiusMpc: null,
      pose: () => null,
      visibleBodies: [],
      viewportPx: [1920, 1080],
      starSphereRangeM: null,
    });
    expect(ctx.slabs).toHaveLength(2);
    expect(ctx.slabs[0]?.index).toBe(NEAR0);
    expect(ctx.slabs[1]?.index).toBe(COSMO);
    expect(Array.from(ctx.slabs[0]!.vp)).toEqual(Array.from(expected[0]!.vp));
    expect(Array.from(ctx.slabs[1]!.vp)).toEqual(Array.from(expected[1]!.vp));
  });

  it('populates canvasSize from canvas dimensions', () => {
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(800, 600),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.canvasSize).toEqual({ width: 800, height: 600 });
  });

  it('forwards galaxyPointRenderer, renderTargets, texturedDisks references onto the ready context', () => {
    const galaxyPointRenderer = { tag: 'galaxyPointRenderer' };
    const renderTargets = { tag: 'renderTargets' };
    const texturedDisks = { tag: 'texturedDisks' };
    const ctx = deriveFrameContext(
      makeState({ galaxyPointRenderer, renderTargets, texturedDisks }),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.galaxyPointRenderer).toBe(galaxyPointRenderer);
    expect(ctx.renderTargets).toBe(renderTargets);
    expect(ctx.texturedDisks).toBe(texturedDisks);
  });

  it('exposes visibleSourceMask and a seeded focus on the ready context', () => {
    const mask = 0b1011;
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      mask,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.visibleSourceMask).toBe(mask);
    expect(ctx.focus.blend).toBe(0);
  });

  it('stamps nowMs onto the ready context', () => {
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      1234.5,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.nowMs).toBe(1234.5);
  });

  it('stamps simDays onto the ready context (the frame epoch every body reader shares)', () => {
    // simDays is a separate axis from nowMs: it is scene time (where the planets
    // are), threaded through so `sceneBodyStates(state, ctx)` evaluates the body
    // snapshot at one agreed instant. A non-J2000 value proves it is the passed
    // argument, not a re-derive.
    const SCRUBBED = 2_460_000.25;
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      SCRUBBED,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.simDays).toBe(SCRUBBED);
  });
});

describe('deriveFrameContext — roll threads into camBasisWorld (P5)', () => {
  it('a rolled camera rotates the body pose basis about forward; forward and position are unaffected', () => {
    const pose0: CameraPose = { target: [0, 0, 0], yaw: 0.2, pitch: 0.1, distance: 100 };
    const poseRolled: CameraPose = { ...pose0, roll: Math.PI / 2 };

    const ctx0 = deriveFrameContext(
      makeState(),
      makeCanvas(),
      pose0,
      absoluteArm(pose0),
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    const ctxRolled = deriveFrameContext(
      makeState(),
      makeCanvas(),
      poseRolled,
      absoluteArm(poseRolled),
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx0.isReady).toBe(true);
    expect(ctxRolled.isReady).toBe(true);
    if (!ctx0.isReady || !ctxRolled.isReady) return;

    const p0 = ctx0.bodyPose('earth');
    const pRolled = ctxRolled.bodyPose('earth');
    expect(p0).not.toBeNull();
    expect(pRolled).not.toBeNull();
    if (p0 === null || pRolled === null) return;

    // Position decodes through poseBasis/yaw/pitch only — roll never touches
    // it, so the eye-relative vector is bit-identical between the two poses.
    expect(pRolled.eyeRelBodyM).toEqual(p0.eyeRelBodyM);

    // forward = basisM[6..8] is unaffected by a rotation ABOUT forward;
    // right/up = basisM[0..5] rotate by 90° and must differ.
    expect(pRolled.basisM[6]).toBeCloseTo(p0.basisM[6], 10);
    expect(pRolled.basisM[7]).toBeCloseTo(p0.basisM[7], 10);
    expect(pRolled.basisM[8]).toBeCloseTo(p0.basisM[8], 10);
    const rightChanged =
      Math.abs(pRolled.basisM[0] - p0.basisM[0]) > 1e-6 ||
      Math.abs(pRolled.basisM[1] - p0.basisM[1]) > 1e-6 ||
      Math.abs(pRolled.basisM[2] - p0.basisM[2]) > 1e-6;
    expect(rightChanged).toBe(true);
  });
});

describe('deriveFrameContext — bodyPose identity seam (m1)', () => {
  it('feeds deriveSlabs the SAME bodyPose closure it forwards onto ctx.bodyPose', () => {
    // `deriveSlabs` is the named import above — vi.mock intercepts module
    // resolution, so this IS the spy-wrapped version.
    const deriveSlabsSpy = vi.mocked(deriveSlabs);
    deriveSlabsSpy.mockClear();

    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      RESTING_ARM,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );

    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(deriveSlabsSpy).toHaveBeenCalledTimes(1);
    // Reference equality, not "produces the same answer" — a refactor that
    // mints a SECOND closure with identical behaviour would pass a
    // value-equality check but reintroduce the drift this seam exists to
    // prevent (a future pose provider swap, or a caching layer, could then
    // change one without the other).
    expect(deriveSlabsSpy.mock.calls[0]![0]!.pose).toBe(ctx.bodyPose);
  });
});

/**
 * The world camera position and basis `frameContext.ts` itself derives from a
 * `CameraPose` — the SAME `assembleOrbitCamera` + `imagePlaneBasis`/`frameUp`
 * composition, so a test built from it exercises the seam's ROUTING (does the
 * right provider fire for the right body?), not a second copy of the world
 * decode arithmetic (already pinned by poseFrameConversion.test.ts).
 */
function worldCamera(
  pose: CameraPose,
  projection: CameraProjection,
): { camPosMpc: Vec3; camBasisWorld: Mat3 } {
  const cam = assembleOrbitCamera(pose, projection, BASIS, BASIS);
  const camForward = normalize3([
    cam.target[0] - cam.position[0],
    cam.target[1] - cam.position[1],
    cam.target[2] - cam.position[2],
  ]);
  const { right, up } = imagePlaneBasis(camForward, cam.roll ?? 0, frameUp(cam.upBasis));
  return { camPosMpc: cam.position, camBasisWorld: mat3FromColumns(right, up, camForward) };
}

describe('deriveFrameContext — pose-provider seam, provider B (Task 14, spec §5.2)', () => {
  it('the engaged body reads provider B, not provider A — a routing test', () => {
    // A world camera ~100 Mpc out puts provider A's `eyeRelBodyM` at ~1e23-1e24 m
    // (heliocentric magnitude). The hand-built body arm below carries a small,
    // near-origin anchor split provider A has no path to produce from THIS
    // camera — so a value equal to it can only have come through provider B.
    // Deleting the `if` at the seam, or threading the wrong arm in, both fall
    // through to provider A's giant-magnitude answer and fail this assertion.
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const basisLocal: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
    const bodyFixedPose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [10, 20, 30],
      eyeRelAnchorM: [1, 2, 3],
      basisLocal,
    };
    const arm: FramedCameraPose = { frame: { body: 'earth' }, pose: bodyFixedPose };

    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      pose,
      arm,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;

    const engaged = ctx.bodyPose('earth');
    expect(engaged).not.toBeNull();
    if (engaged === null) return;
    // Hand-computed fold, independent of `poseFromBodyArm` under test elsewhere
    // (poseFromBodyArm.test.ts owns the fold's own arithmetic).
    expect(engaged.eyeRelBodyM).toEqual([11, 22, 33]);
    expect(engaged.basisM).toEqual(basisLocal);
  });

  it('provider A still serves every body that is not the engaged one', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const marsState = deriveBodyStates(CONST_J2000).get('mars')!;
    const earthState = deriveBodyStates(CONST_J2000).get('earth')!;

    // Engage 'earth'; 'mars' is untouched by the arm and must still resolve
    // through provider A, from the SAME world camera as the engaged body.
    const arm: FramedCameraPose = {
      frame: { body: 'earth' },
      pose: toBodyArm(pose, BASIS, BASIS, 'earth', earthState),
    };

    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      pose,
      arm,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;

    const { camPosMpc, camBasisWorld } = worldCamera(pose, PROJECTION);
    const expectedMars = bodyRelativePose({ camPosMpc, camBasisWorld, bodyState: marsState });
    // `bodyStates` is keyed by the raw orbital-element id string ('mars'), one
    // level narrower than the closed `BodyId` union the seam's public surface
    // exposes — the same cast `slabs.ts`/`liveWorldPose.ts` use at this
    // boundary (see their headers).
    const actualMars = ctx.bodyPose('mars' as BodyId);
    expect(actualMars).not.toBeNull();
    if (actualMars === null) return;
    // Provider A's own derivation, called directly — not a floor comparison:
    // the seam did not touch 'mars' at all, so the two must match exactly.
    expect(actualMars).toEqual(expectedMars);
  });
});
