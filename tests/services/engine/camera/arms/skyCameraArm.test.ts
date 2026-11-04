/**
 * skyCameraArm — a standing eye tagged by its spot. What can fail: the eye leaving
 * the live ground, the horizon tipping, the azimuth lost at the zenith/nadir or
 * at a polar spot, and a decline that hands back a fresh object.
 */

import { describe, it, expect } from 'vitest';

import { CAMERA_ARMS } from '../../../../../src/services/engine/camera/arms/cameraArms';
import { frameKey } from '../../../../../src/services/engine/camera/arms/frameKey';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { pivotFraming } from '../../../../../src/services/engine/camera/pivotRadiusMpc';
import { bodyFixedEyeM } from '../../../../../src/utils/camera/bodyFixedEyeM';
import { findByIdOrThrow } from '../../../../../src/utils/object/findByIdOrThrow';
import { symmetricFrustum } from '../../../../../src/utils/camera/symmetricFrustum';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { SCENE_CELESTIAL_BODIES } from '../../../../../src/data/bodies/sceneCelestialBodies';
import { DEFAULT_CAMERA_TUNING } from '../../../../../src/data/camera/cameraTuning';
import { EMPTY_TILT_MEMORY } from '../../../../../src/data/camera/emptyTiltMemory';
import { SKY_EYE_HEIGHT_M } from '../../../../../src/data/camera/skyEyeHeightM';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../../src/data/defaults';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import type { FrameOf } from '../../../../../src/@types/camera/FrameOf';
import type { FramedPose } from '../../../../../src/@types/camera/FramedPose';
import type { CameraArmCtx } from '../../../../../src/@types/camera/CameraArmCtx';
import type { SceneBodyId } from '../../../../../src/@types/scene/SceneBodyId';
import type { SkySpot } from '../../../../../src/@types/camera/SkySpot';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const EARTH = asSceneBodyId('earth');
const R_EARTH_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'earth', 'skyCameraArm.test').surface
  .datumRadiusM;
const TERRAIN_M = 120;
const ROW = CAMERA_ARMS.sky;
const AZ = 2.0;

const spotAt = (lonRad: number, latRad: number): FrameOf['sky'] => ({
  sky: { body: EARTH, lonRad, latRad },
});
/** Søndermarken. */
const FRAME = spotAt(0.21859354349348772, 0.9716130157244841);

const radialOf = ({ lonRad, latRad }: SkySpot): Vec3 => [
  Math.cos(latRad) * Math.cos(lonRad),
  Math.cos(latRad) * Math.sin(lonRad),
  Math.sin(latRad),
];

function ctxFor(focusBodyId: SceneBodyId | null, calls: unknown[][] = []): CameraArmCtx {
  return {
    bodies: deriveBodyStates(CONST_J2000),
    poseBasis: B,
    upBasis: B,
    terrainHeightAt: (...args) => {
      calls.push(args);
      return args[0] === 'earth' ? TERRAIN_M : 0;
    },
    focusBodyId,
    pivot: pivotFraming(null),
    viewportPx: [100, 100],
    frustum: symmetricFrustum(Math.PI / 3, 1),
    fovYRad: Math.PI / 3,
    tuning: DEFAULT_CAMERA_TUNING,
  };
}

const framed = (azimuthRad: number, altitudeRad: number, frame = FRAME): FramedPose<'sky'> => ({
  frame,
  pose: { azimuthRad, altitudeRad },
});

const roundTrip = (start: FramedPose<'sky'>) => {
  const ctx = ctxFor(null);
  return ROW.fromParent(ROW.toParent(start, ctx), start.frame, ctx).pose;
};

describe('the sky arm', () => {
  it('toParent then fromParent returns the pose', () => {
    for (const altitudeRad of [-Math.PI / 2, -0.5, 0, 0.7, Math.PI / 2]) {
      const back = roundTrip(framed(AZ, altitudeRad));
      expect(back.altitudeRad).toBeCloseTo(altitudeRad, 9);
      expect(back.azimuthRad).toBeCloseTo(AZ, 9);
    }
  });

  it('the eye stands SKY_EYE_HEIGHT_M above the live terrain', () => {
    const calls: unknown[][] = [];
    const arm = ROW.toParent(framed(AZ, 0.3), ctxFor(null, calls)).pose;
    const eye = bodyFixedEyeM(arm);
    expect(Math.hypot(...eye) - (R_EARTH_M + TERRAIN_M + SKY_EYE_HEIGHT_M)).toBeCloseTo(0, 6);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('earth');
    const radial = radialOf(FRAME.sky);
    const dir = calls[0]![1] as Vec3;
    for (let i = 0; i < 3; i++) expect(dir[i]).toBeCloseTo(radial[i]!, 12);
  });

  it('the horizon is level', () => {
    const up = radialOf(FRAME.sky);
    for (const altitudeRad of [0, 0.7, Math.PI / 2]) {
      const m = ROW.toParent(framed(AZ, altitudeRad), ctxFor(null)).pose.basisLocal;
      expect(Math.abs(m[0] * up[0] + m[1] * up[1] + m[2] * up[2])).toBeLessThan(1e-12);
    }
  });

  it('a spot at the pole folds to a finite pose and round-trips', () => {
    const pole = spotAt(0.3, Math.PI / 2);
    const arm = ROW.toParent(framed(AZ, 0.4, pole), ctxFor(null)).pose;
    for (const v of arm.basisLocal) expect(Number.isFinite(v)).toBe(true);
    expect(roundTrip(framed(AZ, 0.4, pole)).altitudeRad).toBeCloseTo(0.4, 9);
  });

  it('an azimuth past π folds to the same view as its wrapped value', () => {
    const ctx = ctxFor(null);
    const past = ROW.toParent(framed((3 * Math.PI) / 2, 0.3), ctx).pose.basisLocal;
    const wrapped = ROW.toParent(framed(-Math.PI / 2, 0.3), ctx).pose.basisLocal;
    for (let i = 0; i < 9; i++) expect(past[i]).toBeCloseTo(wrapped[i]!, 12);
    const az = roundTrip(framed((3 * Math.PI) / 2, 0.3)).azimuthRad;
    expect(az).toBeGreaterThan(-Math.PI);
    expect(az).toBeLessThanOrEqual(Math.PI);
    expect(az).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('two spots differing only in longitude have different frameKeys', () => {
    expect(frameKey(spotAt(0.2, 0.9))).not.toBe(frameKey(spotAt(0.21, 0.9)));
  });

  it('step and nudge decline by reference', () => {
    const ctx = ctxFor(EARTH);
    const start = framed(AZ, 0.3);
    const input = { kind: 'zoom', factor: 2, duringGesture: false, cursorPx: null } as const;
    expect(ROW.step(null, EMPTY_TILT_MEMORY, start, input, ctx).pose).toBe(start.pose);
    expect(ROW.nudge(EMPTY_TILT_MEMORY, start, { look: [0.1, 0.1] }, ctx).pose).toBe(start.pose);
  });

  it('release is true once the focus leaves the host', () => {
    const start = framed(AZ, 0.3);
    expect(ROW.release(start, ctxFor(null))).toBe(false);
    expect(ROW.release(start, ctxFor(EARTH))).toBe(false);
    expect(ROW.release(start, ctxFor(asSceneBodyId('mars')))).toBe(true);
  });
});
