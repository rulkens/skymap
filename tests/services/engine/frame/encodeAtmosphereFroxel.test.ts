/**
 * encodeAtmosphereFroxel — the two behaviours the volume's cost model rests on.
 *
 * Outside every shell the bake must dispatch NOTHING: the froxel volume exists
 * only for the body the camera is inside, and an outside frame has to cost
 * exactly what it costs without this feature (the Task 5 perf gate measures
 * that). Inside, exactly one body bakes.
 *
 * The uniform record is deliberately NOT re-derived here — building the
 * expectation with the same `atmosphereShellUniforms` the code calls would be a
 * mirror of the implementation. Its correctness is `atmosphereUniformsLayout`'s
 * parity test plus the visual gate.
 */

import { describe, it, expect, vi } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import { encodeAtmosphereFroxel } from '../../../../src/services/engine/frame/encodeAtmosphereFroxel';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { BodyPoseProvider } from '../../../../src/@types/engine/camera/BodyPoseProvider';
import type { EarthBody } from '../../../../src/@types/scene/EarthBody';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

// `atmosphereDrawList` resolves each body's live position/orientation from the
// per-frame snapshot for its sun direction; stub it off the fixtures, reusing
// their own refs (the `encodeAtmosphereSkyView` suite's arrangement).
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    for (const b of (state.data.bodies.planets ?? []) as readonly SeededPlanet[]) {
      m.set(b.id, { positionMpc: b.positionMpc, orientation: b.orientation, meanAnomalyRad: 0 });
    }
    const earth = state.data.bodies.earth as SeededEarth | null;
    if (earth)
      m.set(earth.id, {
        positionMpc: earth.positionMpc,
        orientation: earth.orientation,
        meanAnomalyRad: 0,
      });
    return m;
  }),
}));

type SeededEarth = EarthBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
const EARTH_STATE = deriveBodyStates(CONST_J2000).get('earth')!;
const SEEDED_EARTH: SeededEarth = {
  ...SCENE_EARTH,
  positionMpc: EARTH_STATE.positionMpc,
  orientation: EARTH_STATE.orientation,
};

const encoder = {} as unknown as GPUCommandEncoder;

/** Earth's `body-m` row — the slab the uniform record's MVP pair is built from. */
const EARTH_SLAB = {
  index: 0,
  near: 1,
  far: 1e9,
  vp: mat4d.identity() as Float64Array,
  frame: { kind: 'body-m', bodyId: 'earth' },
  distanceRangeM: null,
  precision: 'f64',
  reversedZ: true,
} as unknown as Slab;

function spyRenderer(): { encodeFroxel: ReturnType<typeof vi.fn> } {
  return { encodeFroxel: vi.fn() };
}

function makeState(renderer: unknown): EngineState {
  return {
    gpu: { atmosphereShellRenderer: renderer },
    data: { bodies: { earth: SEEDED_EARTH, planets: [] } },
    settings: { earth: { atmosphereExposure: 1 } },
  } as unknown as EngineState;
}

function makeBodyPose(eyeRelBodyM: Vec3): BodyPoseProvider {
  return (bodyId) =>
    bodyId === 'earth' ? { eyeRelBodyM, basisM: [...IDENTITY_MAT3] as Mat3 } : null;
}

/**
 * `drawCamPos` only feeds `atmosphereDrawList`'s sub-pixel disc cull; sized off
 * the same offset as the pose so Earth resolves well above a pixel either way.
 */
function makeCtx(eyeRelBodyM: Vec3, slabs: readonly Slab[] = [EARTH_SLAB]): ReadyFrameContext {
  const offsetMpc = Math.hypot(...eyeRelBodyM) * SCALE_UNITS.M_TO_MPC;
  return {
    bodyPose: makeBodyPose(eyeRelBodyM),
    drawCamPos: [
      SEEDED_EARTH.positionMpc[0] + offsetMpc,
      SEEDED_EARTH.positionMpc[1],
      SEEDED_EARTH.positionMpc[2],
    ] as Vec3,
    cam: { distance: 0 },
    canvasSize: { width: 1920, height: 1080 },
    fovYRad: Math.PI / 4,
    slabs,
  } as unknown as ReadyFrameContext;
}

const OUTSIDE_POSE: Vec3 = [5 * SEEDED_EARTH.radiusM, 0, 0];
const INSIDE_POSE: Vec3 = [0.5 * SEEDED_EARTH.radiusM, 0, 0];

describe('encodeAtmosphereFroxel', () => {
  it('dispatches nothing when no body is inside the shell', () => {
    const renderer = spyRenderer();
    encodeAtmosphereFroxel(encoder, makeCtx(OUTSIDE_POSE), makeState(renderer));
    expect(renderer.encodeFroxel).not.toHaveBeenCalled();
  });

  it('bakes for the body the camera is inside', () => {
    const renderer = spyRenderer();
    encodeAtmosphereFroxel(encoder, makeCtx(INSIDE_POSE), makeState(renderer));
    expect(renderer.encodeFroxel).toHaveBeenCalledTimes(1);
    const [encoderArg, bodyIdArg, uniforms] = renderer.encodeFroxel.mock.calls[0]! as [
      GPUCommandEncoder,
      string,
      Float32Array,
    ];
    expect(encoderArg).toBe(encoder);
    expect(bodyIdArg).toBe('earth');
    expect(uniforms).toBeInstanceOf(Float32Array);
  });
});
