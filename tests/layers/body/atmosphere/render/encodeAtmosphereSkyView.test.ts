/**
 * encodeAtmosphereSkyView — the per-frame sky-view LUT bake. Pinned: (1) the `SkyViewParams` packing
 * contract (AtmosphereShellRenderer.d.ts): the renderer writes the 16-byte record VERBATIM, so a
 * mis-pack silently mis-indexes the LUT (no GPU error; on iOS a dropped frame), and slots 0-3 are
 * recomputed from the contract's formulae; (2) the SOURCE of the camera altitude: the entry's
 * `camLocal`/`sunLocal` off the body-slab pose seam, NOT a Mpc-side re-derivation from
 * `ctx.drawCamPos`/`state.cam.position`. The roster is handed in: which bodies some view
 * draws is `atmosphereRosterPlanner`'s call, not this encode's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { encodeAtmosphereSkyView } from '../../../../../src/layers/body/atmosphere/render/encodeAtmosphereSkyView';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { ATMOSPHERE_PARAMS } from '../../../../../src/layers/body/atmosphere/data/atmosphereParams';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { bodySlabCamLocal } from '../../../../../src/utils/camera/bodyCompose/bodySlabCamLocal';
import { sunDirLocal } from '../../../../../src/utils/camera/bodyCompose/sunDirLocal';
import { IDENTITY_MAT3 } from '../../../../../src/utils/math/identityMat3';
import type { PositionedId } from '../../../../../src/@types/scene/PositionedId';
import { createFramePlannerResultStore } from '../../../../../src/services/engine/frame/createFramePlannerResultStore';
import { atmosphereRosterPlanner } from '../../../../../src/layers/body/atmosphere/present/atmosphereRosterPlanner';
import type { AtmosphereShellRenderer } from '../../../../../src/layers/body/atmosphere/@types/AtmosphereShellRenderer';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { BodyPoseProvider } from '../../../../../src/@types/engine/camera/BodyPoseProvider';
import { seededBodyStates } from '../../../../helpers/frame/seededBodyStates';
import type { SeededBody } from '../../../../helpers/frame/SeededBody';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';

// `atmosphereEntry` resolves positions/orientations (for `sunDirLocal`) from this snapshot; stub
// it from the SeededBody fixtures, reusing their refs so the sun-direction recompute is bit-for-bit.
vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(() => seededBodyStates(0, [SEEDED_EARTH])),
}));

const EARTH_STATE = deriveBodyStates(CONST_J2000).get(asSceneBodyId('earth'))!;
const SEEDED_EARTH: SeededBody = {
  ...SCENE_EARTH,
  positionMpc: EARTH_STATE.positionMpc,
  orientation: EARTH_STATE.orientation,
};

/** The ONE compute pass the encode opens for the whole roster — the shape
 *  that lets the step bill a single GPU-timing slot. */
const computePass = { end: vi.fn() } as unknown as GPUComputePassEncoder;
const beginComputePass = vi.fn((_descriptor?: GPUComputePassDescriptor) => computePass);
const encoder = { beginComputePass } as unknown as GPUCommandEncoder;

function spyRenderer(): AtmosphereShellRenderer & { dispatchSkyView: ReturnType<typeof vi.fn> } {
  return { dispatchSkyView: vi.fn() } as unknown as AtmosphereShellRenderer & {
    dispatchSkyView: ReturnType<typeof vi.fn>;
  };
}

/** The encode reads only ctx and the static scene tables; `state` is the pass-state it is handed. */
function makeState(): EngineState {
  return {} as unknown as EngineState;
}

function makeBodyPose(eyeRelBodyM: Vec3): BodyPoseProvider {
  return (bodyId) =>
    bodyId === 'earth' ? { eyeRelBodyM, basisM: [...IDENTITY_MAT3] as Mat3 } : null;
}

/** A plans store holding `roster` as `atmosphereRosterPlanner`'s answer. */
function rosterPlans(roster: readonly PositionedId[]) {
  const plans = createFramePlannerResultStore();
  const result = { value: new Set(roster), awake: false, settling: false, loading: false };
  plans.put(atmosphereRosterPlanner, undefined, result);
  return plans;
}

/**
 * The minimal FrameView the encode reads: `bodyPose` (source of the camera altitude) and the
 * frame's plans store holding the roster (Earth by default).
 */
function makeCtx(input: {
  bodyPose: BodyPoseProvider;
  roster?: readonly PositionedId[];
}): FrameView {
  return {
    bodyPose: input.bodyPose,
    snapshot: { plans: rosterPlans(input.roster ?? [SCENE_EARTH.id]) },
  } as unknown as FrameView;
}

// The rendered pose (what `atmosphereShellPass`'s fragment sees): the camera
// 5 Earth radii out along the body's local +x axis, in METRES — already in the
// body-fixed frame the seam promises, so the recompute below needs no
// orientation matrix multiply of its own.
const EYE_REL_BODY_M: Vec3 = [5 * SEEDED_EARTH.surface.datumRadiusM, 0, 0];

describe('encodeAtmosphereSkyView', () => {
  beforeEach(() => {
    beginComputePass.mockClear();
  });

  // The step owns ONE GPU-timing slot, so it must open ONE compute pass however
  // many bodies bake — per-body passes would each write that slot's two query
  // indices and the last body would silently decide what the panel reports.
  it('opens one compute pass for the roster, carrying the claimed timestamp writes', () => {
    const renderer = spyRenderer();
    const writes = { querySet: {}, beginningOfPassWriteIndex: 4, endOfPassWriteIndex: 5 };
    const claim = vi.fn(() => ({
      timestampWrites: writes as unknown as GPUComputePassTimestampWrites,
    }));
    encodeAtmosphereSkyView(
      renderer,
      encoder,
      makeCtx({ bodyPose: makeBodyPose(EYE_REL_BODY_M) }),
      makeState(),
      claim,
    );
    expect(beginComputePass).toHaveBeenCalledTimes(1);
    expect(beginComputePass.mock.calls[0]![0]).toMatchObject({ timestampWrites: writes });
  });

  // Claiming a slot marks it LIVE for the frame, and a query set holds its last
  // write — so a claim on a frame that opens no pass makes the panel report the
  // ticks from whenever the atmosphere was last in view, as if it still were.
  it('claims no timing slot and opens no pass when the roster is empty', () => {
    const claim = vi.fn(() => ({}));
    encodeAtmosphereSkyView(
      spyRenderer(),
      encoder,
      makeCtx({
        bodyPose: makeBodyPose(EYE_REL_BODY_M),
        roster: [],
      }),
      makeState(),
      claim,
    );
    expect(beginComputePass).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it('is a no-op when no view draws an atmosphere', () => {
    const renderer = spyRenderer();
    encodeAtmosphereSkyView(
      renderer,
      encoder,
      makeCtx({
        bodyPose: makeBodyPose(EYE_REL_BODY_M),
        roster: [],
      }),
      makeState(),
    );
    expect(renderer.dispatchSkyView).not.toHaveBeenCalled();
  });

  it('bakes the SkyViewParams from ctx.bodyPose (the M1 body-slab pose seam), via bodySlabCamLocal', () => {
    const renderer = spyRenderer();
    encodeAtmosphereSkyView(
      renderer,
      encoder,
      makeCtx({ bodyPose: makeBodyPose(EYE_REL_BODY_M) }),
      makeState(),
    );

    expect(renderer.dispatchSkyView).toHaveBeenCalledTimes(1);
    const [passArg, bodyIdArg, uniforms] = renderer.dispatchSkyView.mock.calls[0]! as [
      GPUComputePassEncoder,
      string,
      Float32Array,
    ];
    expect(passArg).toBe(computePass);
    expect(bodyIdArg).toBe(SEEDED_EARTH.id);
    expect(uniforms).toBeInstanceOf(Float32Array);
    expect(uniforms).toHaveLength(4);

    // Independent recompute from the contract's formula with the SAME `bodySlabCamLocal` util: the
    // camera is in ATMOSPHERE-TOP-radius units (NOT surface radius); its length × atmosphere-top km
    // recovers the camera radius in km.
    const params = ATMOSPHERE_PARAMS['earth']!;
    const atmosphereTopM = params.atmosphereTopKm * SCALE_UNITS.KM_TO_M;
    const camLocal = bodySlabCamLocal(EYE_REL_BODY_M, atmosphereTopM);
    const radius = Math.hypot(camLocal[0], camLocal[1], camLocal[2]);
    const sun = sunDirLocal(SEEDED_EARTH.positionMpc, RENDER_ORIGIN_MPC, SEEDED_EARTH.orientation);
    const expectedViewHeightKm = radius * params.atmosphereTopKm;
    const expectedSunZenithCos =
      (camLocal[0] * sun[0] + camLocal[1] * sun[1] + camLocal[2] * sun[2]) / radius;

    // The encode narrows this f64 expression once at the Float32Array write, so the slot equals
    // Math.fround bit-for-bit (values ~3e4 km, where toBeCloseTo's absolute tolerance is meaningless).
    expect(uniforms[0]).toBe(Math.fround(expectedViewHeightKm));
    expect(uniforms[1]).toBe(Math.fround(expectedSunZenithCos));

    const fartherPose: Vec3 = [0, 0, 20 * SEEDED_EARTH.surface.datumRadiusM];
    const fartherRenderer = spyRenderer();
    encodeAtmosphereSkyView(
      fartherRenderer,
      encoder,
      makeCtx({ bodyPose: makeBodyPose(fartherPose) }),
      makeState(),
    );
    const fartherUniforms = fartherRenderer.dispatchSkyView.mock.calls[0]![2] as Float32Array;
    expect(fartherUniforms[0]).toBeGreaterThan(uniforms[0]!);

    // Five radii out is well above the surface: a surface-radius mis-scale would collapse the altitude.
    expect(uniforms[0]!).toBeGreaterThan(params.planetRadiusKm);
    expect(uniforms[2]).toBe(Math.fround(params.twilightSoftness));
    expect(uniforms[3]).toBe(Math.fround(params.twilightIntensity));
  });
});
