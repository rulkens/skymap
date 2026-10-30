/**
 * frameContext — the per-FRAME derived snapshot: one camera, one body-state sample, one clock.
 * `ctx.cam` is the caller-passed `OrbitCamera`; view-shaped assertions (`vp`, `slabs`,
 * `drawPxPerRad`, the turned `bodyPose`) go through the canvas view. Fixtures reuse one basis
 * (`BASIS`); the poseBasis/upBasis split is `runFrame.test.ts`'s job.
 */

import { describe, it, expect, vi } from 'vitest';

// Spy wrapping the REAL `deriveSlabs`: the identity test asserts `deriveView` fed it the SAME
// `bodyPose` closure it forwards onto `FrameView.bodyPose`; nothing else fails if a refactor
// mints a second closure.
vi.mock('../../../../src/services/engine/frame/slabs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/engine/frame/slabs')>();
  return { ...actual, deriveSlabs: vi.fn(actual.deriveSlabs) };
});

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import { canvasViewOf } from '../../../helpers/frame/canvasViewOf';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameContextInput } from '../../../../src/@types/engine/frame/FrameContextInput';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { BodyFixedPose } from '../../../../src/@types/camera/BodyFixedPose';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Size } from '../../../../src/@types/rendering/Size';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { computeViewProj } from '../../../../src/utils/camera/computeViewProj';
import { deriveSlabs, NEAR0, COSMO } from '../../../../src/services/engine/frame/slabs';
import { frameBodyStates } from '../../../../src/services/engine/frame/frameBodyStates';
import { frameContextInputOf } from '../../../../src/services/engine/frame/frameContextInputOf';
import { sceneBodyStates } from '../../../../src/services/engine/frame/sceneBodyStates';
import type { SelectionKindRow } from '../../../../src/@types/engine/layer/SelectionKindRow';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { toBodyArm } from '../../../../src/services/engine/camera/poseFrameConversion';
import { bodyRelativePose } from '../../../../src/services/engine/camera/bodyRelativePose';
import { cameraBasisWorld } from '../../../../src/utils/camera/cameraBasisWorld';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';
import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import type { FadeIdentity } from '../../../../src/@types/animation/FadeIdentity';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/datumOnlyTerrainHeight';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { SEEDED_STAR_CATALOGS } from '../../../../src/data/bodies/seededStarCatalogs';

const RESTING_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
const PROJECTION: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };
const CANVAS: Size = { width: 1920, height: 1080 };

// Identity basis: the frame-local decode is already world space.
const BASIS: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** `isEngineReady` guard fields populated by default (clear one for the not-ready branch); the
 *  other renderer fields are non-gating but `deriveSlabs`/`visibleSlabBodies` read past them. */
function makeState(
  overrides: {
    booted?: boolean;
    galaxyPointRenderer?: unknown;
    renderTargets?: unknown;
    galaxyPickRenderer?: unknown;
    compositor?: unknown;
    texturedDisks?: unknown;
  } = {},
): EngineState {
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
    booted: overrides.booted ?? true,
    gpu: { galaxyPointRenderer, renderTargets, galaxyPickRenderer, compositor },
    terrainHeightAt: datumOnlyTerrainHeight,
    subsystems: { texturedDisks },
    // No focused pivot: the input's `altitudeMpc` is the raw cam.distance.
    selectionRows: { hover: null, select: null, focus: null },
    // No seeded bodies or covered stars: every fixture stays a 2-row (NEAR0+COSMO) slab table.
    slabRows: [],
    visibilityEntries: [],
    settings: {
      bodies: { items: {} },
    },
    picking: { pickInFlight: false, cursorTexPx: null },
  } as unknown as EngineState;
}

function frameInput(
  pose: CameraPose,
  over: {
    arm?: FramedCameraPose;
    projection?: CameraProjection;
    simDays?: number;
  } = {},
): FrameContextInput {
  const projection = over.projection ?? PROJECTION;
  return {
    cam: assembleOrbitCamera(pose, projection, BASIS, BASIS),
    arm: over.arm ?? absoluteArm(pose),
    altitudeMpc: pose.distance,
    nowMs: 0,
    simDays: over.simDays ?? CONST_J2000,
    bodyStates: deriveBodyStates(over.simDays ?? CONST_J2000),
  };
}

function canvasView(state: EngineState, input: FrameContextInput): FrameView {
  const view = canvasViewOf(state, input, CANVAS);
  if (view === null) throw new Error('fixture not ready');
  return view;
}

describe('deriveFrameContext — not-ready branch', () => {
  it('returns isReady:false before boot', () => {
    expect(deriveFrameContext(makeState({ booted: false }), frameInput(RESTING_POSE)).isReady).toBe(
      false,
    );
  });

  it('returns isReady:false when gpu.renderTargets is null', () => {
    expect(
      deriveFrameContext(makeState({ renderTargets: null }), frameInput(RESTING_POSE)).isReady,
    ).toBe(false);
  });

  it('returns isReady:false when gpu.compositor is null', () => {
    expect(
      deriveFrameContext(makeState({ compositor: null }), frameInput(RESTING_POSE)).isReady,
    ).toBe(false);
  });
});

describe('deriveFrameContext — ready branch', () => {
  it("derives a ready context whose canvas view carries the caller's projection and orbit distance", () => {
    const pose: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
    const projection: CameraProjection = { fovYRad: 1.2, aspect: 2, near: 0.01, far: 5000 };
    const input = frameInput(pose, { projection });
    expect(deriveFrameContext(makeState(), input).isReady).toBe(true);
    // The canvas view's camera is the TURNED one: same projection and orbit
    // distance (the foreground gates read it), pose carried by its bases.
    const canvas = canvasView(makeState(), input);
    expect(canvas.cam.fovYRad).toBeCloseTo(1.2, 12);
    expect(canvas.cam.aspect).toBeCloseTo(2, 12);
    expect(canvas.cam.distance).toBe(50);
    expect(canvas.cam.yaw).toBe(0);
  });

  it('drawPxPerRad uses projection.fovYRad', () => {
    const canvas = canvasView(makeState(), frameInput(RESTING_POSE));
    // pxPerRad = height / (2 * tan(fovY / 2))
    expect(canvas.drawPxPerRad).toBeCloseTo(1080 / (2 * Math.tan(0.5)), 6);
  });

  it('view.vp matches computeViewProj(assembleOrbitCamera(pose, projection, poseBasis, upBasis))', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const canvas = canvasView(makeState(), frameInput(pose));
    const expected = computeViewProj(
      assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS),
      symmetricFrustum(PROJECTION.fovYRad, PROJECTION.aspect),
    );
    expect(Array.from(canvas.vp)).toEqual(Array.from(expected));
  });

  it('populates view.slabs from deriveSlabs(cam, vp) — the single per-view derivation', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const canvas = canvasView(makeState(), frameInput(pose));
    const cam = assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS);
    const expected = deriveSlabs({
      cam,
      frustum: symmetricFrustum(cam.fovYRad, cam.aspect),
      cosmoVp: computeViewProj(cam, symmetricFrustum(cam.fovYRad, cam.aspect)),
      altitudeMpc: cam.distance,
      pose: () => null,
      visibleRows: [],
      viewportPx: [1920, 1080],
      starSphereRangeM: null,
    });
    expect(canvas.slabs).toHaveLength(2);
    expect(canvas.slabs[0]?.index).toBe(NEAR0);
    expect(canvas.slabs[1]?.index).toBe(COSMO);
    expect(Array.from(canvas.slabs[0]!.vp)).toEqual(Array.from(expected[0]!.vp));
    expect(Array.from(canvas.slabs[1]!.vp)).toEqual(Array.from(expected[1]!.vp));
  });

  it('exposes a seeded focus on the ready context', () => {
    const ctx = deriveFrameContext(makeState(), frameInput(RESTING_POSE));
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.focus.blend).toBe(0);
  });

  it('stamps simDays onto the ready context (the frame epoch every body reader shares)', () => {
    // simDays is scene time (where the planets are), distinct from nowMs; a non-J2000 value proves
    // it is the passed argument, not re-derived.
    const SCRUBBED = 2_460_000.25;
    const ctx = deriveFrameContext(makeState(), frameInput(RESTING_POSE, { simDays: SCRUBBED }));
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.simDays).toBe(SCRUBBED);
  });
});

describe('deriveFrameContext — the placed selection', () => {
  // Reverting runFrame's input to `deriveBodyStates` would silently drop the satellite from
  // the selection ring, the InfoCard distance and the pick path.
  it('holds the focused satellite where core placed it', () => {
    const poseId = 'transient:satellite-25544';
    const ref = { type: 'satellite', noradId: 25544 } as const;
    const positionMpc: Vec3 = [1e-5, 2e-5, 3e-5];
    const row = {
      type: 'satellite',
      positionMpc,
      driver: { poseId, followsSimClock: true, boundingRadiusM: 50, groundRadiusM: null },
    } as unknown as SelectionRow;
    const state = {
      ...makeState(),
      selectionRows: { hover: null, select: null, focus: row },
      selectionKindRows: [
        { type: 'satellite', extractRow: () => row } as unknown as SelectionKindRow,
      ],
      cameraRuntime: { outputs: { displayed: absoluteArm(RESTING_POSE), projection: PROJECTION } },
    } as unknown as EngineState;
    const bodyStates = frameBodyStates(
      {
        selection: {
          hover: null,
          select: null,
          focus: ref,
          pending: { select: null, focus: null },
        },
        selectionRows: state.selectionRows,
      },
      state.selectionKindRows,
      CONST_J2000,
    );
    const { input } = frameContextInputOf(state, {
      worldPose: RESTING_POSE,
      nowMs: 0,
      poseBasis: BASIS,
      upBasis: BASIS,
      simDays: CONST_J2000,
      bodyStates,
    });
    expect(sceneBodyStates(state, canvasView(state, input)).get(poseId)!.positionMpc).toEqual(
      positionMpc,
    );
  });
});

describe('deriveFrameContext — roll threads into camBasisWorld (P5)', () => {
  it('a rolled camera rotates the body pose basis about forward; forward and position are unaffected', () => {
    const pose0: CameraPose = { target: [0, 0, 0], yaw: 0.2, pitch: 0.1, distance: 100 };
    const poseRolled: CameraPose = { ...pose0, roll: Math.PI / 2 };

    const ctx0 = deriveFrameContext(makeState(), frameInput(pose0));
    const ctxRolled = deriveFrameContext(makeState(), frameInput(poseRolled));
    expect(ctx0.isReady).toBe(true);
    expect(ctxRolled.isReady).toBe(true);
    if (!ctx0.isReady || !ctxRolled.isReady) return;

    const p0 = ctx0.bodyPose(asSceneBodyId('earth'));
    const pRolled = ctxRolled.bodyPose(asSceneBodyId('earth'));
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

describe('deriveView — bodyPose identity seam (m1)', () => {
  it('feeds deriveSlabs the SAME bodyPose closure it forwards onto ctx.bodyPose', () => {
    const deriveSlabsSpy = vi.mocked(deriveSlabs);
    deriveSlabsSpy.mockClear();

    const canvas = canvasView(makeState(), frameInput(RESTING_POSE));

    expect(deriveSlabsSpy).toHaveBeenCalledTimes(1);
    // Reference equality: a second closure with identical behaviour would pass a value check but
    // reintroduce the drift this seam exists to prevent.
    expect(deriveSlabsSpy.mock.calls[0]![0]!.pose).toBe(canvas.bodyPose);
  });
});

/** The world camera position and basis `frameContext.ts` derives from a `CameraPose`, so a test
 *  built from it exercises the seam's ROUTING, not a copy of the world decode arithmetic
 *  (pinned by poseFrameConversion.test.ts). */
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
  return {
    camPosMpc: cam.position,
    camBasisWorld: cameraBasisWorld(camForward, cam.roll ?? 0, cam.upBasis),
  };
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
      bodyId: asSceneBodyId('earth'),
      anchorLocalM: [10, 20, 30],
      eyeRelAnchorM: [1, 2, 3],
      basisLocal,
    };
    const arm: FramedCameraPose = { frame: { body: asSceneBodyId('earth') }, pose: bodyFixedPose };

    const ctx = deriveFrameContext(makeState(), frameInput(pose, { arm }));
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;

    const engaged = ctx.bodyPose(asSceneBodyId('earth'));
    expect(engaged).not.toBeNull();
    if (engaged === null) return;
    // Hand-computed fold, independent of `poseFromBodyArm` under test elsewhere
    // (poseFromBodyArm.test.ts owns the fold's own arithmetic).
    expect(engaged.eyeRelBodyM).toEqual([11, 22, 33]);
    expect(engaged.basisM).toEqual(basisLocal);
  });

  it('provider A still serves every body that is not the engaged one', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const marsState = deriveBodyStates(CONST_J2000).get(asSceneBodyId('mars'))!;
    const earthState = deriveBodyStates(CONST_J2000).get(asSceneBodyId('earth'))!;

    // Engage 'earth'; 'mars' is untouched by the arm and must still resolve
    // through provider A, from the SAME world camera as the engaged body.
    const arm: FramedCameraPose = {
      frame: { body: asSceneBodyId('earth') },
      pose: toBodyArm(pose, BASIS, BASIS, asSceneBodyId('earth'), earthState),
    };

    const ctx = deriveFrameContext(makeState(), frameInput(pose, { arm }));
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;

    const { camPosMpc, camBasisWorld } = worldCamera(pose, PROJECTION);
    const expectedMars = bodyRelativePose({ camPosMpc, camBasisWorld, bodyState: marsState });
    const actualMars = ctx.bodyPose(asSceneBodyId('mars'));
    expect(actualMars).not.toBeNull();
    if (actualMars === null) return;
    // Provider A's own derivation, called directly — not a floor comparison:
    // the seam did not touch 'mars' at all, so the two must match exactly.
    expect(actualMars).toEqual(expectedMars);
  });
});

describe('deriveFrameContext — scene-body admission', () => {
  function admittedIds(
    sunFade: number,
    starClip = 1,
    eyeFromHomeMpc = SCALE_UNITS.AU_TO_MPC,
  ): readonly string[] {
    const state = {
      ...makeState(),
      visibilityEntries: APP_VISIBILITY,
      subsystems: {
        texturedDisks: {},
        fades: {
          opacityOf: (id: FadeIdentity) =>
            id.address === 'starCatalog' && id.item === 'sun' ? sunFade : 1,
        },
        clipPlayer: {
          clipOpacityOf: (address: string) => (address === 'starCatalog' ? starClip : 1),
        },
      },
    } as unknown as EngineState;
    const pose: CameraPose = { ...RESTING_POSE, distance: eyeFromHomeMpc };
    const snapshot = deriveFrameContext(state, frameInput(pose));
    if (!snapshot.isReady) throw new Error('fixture not ready');
    return snapshot.sceneBodies.map(({ body }) => body.id);
  }

  it("a star body is not admitted past its region's band", () => {
    const famousIds: string[] = SEEDED_STAR_CATALOGS.famousStar.map((body) => body.id);
    expect(admittedIds(1)).toEqual(expect.arrayContaining(famousIds));
    const atCutoff = admittedIds(1, 1, FOREGROUND_MAX_DISTANCE_MPC);
    expect(atCutoff.filter((id) => famousIds.includes(id))).toEqual([]);
    expect(atCutoff).toContain('mars');
  });

  it("a covered body is admitted only while every covering item's handed value is above 0", () => {
    expect(admittedIds(1)).toContain('sun');
    expect(admittedIds(0.4)).toContain('sun');
    expect(admittedIds(0)).not.toContain('sun');
    // A raw fade of 1 under a clip at 0 hands 0: the clip hides it too.
    expect(admittedIds(1, 0)).not.toContain('sun');
    expect(admittedIds(0)).toContain('mars');
    expect(admittedIds(1, 0)).toContain('mars');
  });
});
