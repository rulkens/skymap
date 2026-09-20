import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { bodyPhasePose } from '../../../../tools/utils/capture/bodyPhasePose';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { bodyFootprintRadiusM } from '../../../../src/utils/scene/bodyFootprintRadiusM';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';

const T = '2026-09-18T12:00:00Z';
const FOV_Y_RAD = Math.PI / 3;
// Spread around the sky and well off the ecliptic frame's +x seam, so a basis
// mix-up cannot pass by symmetry: decoded through the world axes instead of the
// ecliptic ones these read 35°–124°, never the angle asked for.
const BODIES = ['body-earth', 'body-jupiter', 'body-uranus', 'body-europa', 'body-enceladus'];

const angleDeg = (a: Vec3, b: Vec3): number => {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cos = dot / (Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2]));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
};

/** Where the pose puts the eye relative to the body, decoded as the app does. */
function toCameraOf(focusId: string, phaseDeg: number): Vec3 {
  const pose = bodyPhasePose(focusId, T, phaseDeg, FOV_Y_RAD);
  const eye = eyeMpcOf(pose, ORIENTATION_FRAMES.ecliptic);
  return [eye[0] - pose.target[0], eye[1] - pose.target[1], eye[2] - pose.target[2]];
}

/** The Sun–body–camera angle the pose actually produces. */
function phaseAngleDeg(focusId: string, phaseDeg: number): number {
  const target = bodyPhasePose(focusId, T, phaseDeg, FOV_Y_RAD).target;
  return angleDeg(toCameraOf(focusId, phaseDeg), [-target[0], -target[1], -target[2]]);
}

describe('bodyPhasePose', () => {
  // The turn folds at 180°: 315° and 45° are both 45° off the Sun, mirrored.
  it.each([0, 45, 90, 135, 180, 225, 270, 315])('swings %i° around the body', (phaseDeg) => {
    const expected = phaseDeg > 180 ? 360 - phaseDeg : phaseDeg;
    for (const focusId of BODIES) {
      expect(phaseAngleDeg(focusId, phaseDeg)).toBeCloseTo(expected, 4);
    }
  });

  it('mirrors the two halves of the turn, so 45° and 315° light opposite limbs', () => {
    expect(angleDeg(toCameraOf('body-earth', 45), toCameraOf('body-earth', 315))).toBeCloseTo(
      90,
      4,
    );
  });

  it('frames every body to the same apparent size', () => {
    const apparentRad = (focusId: string): number => {
      const pose = bodyPhasePose(focusId, T, 315, FOV_Y_RAD);
      const body = findByIdOrThrow(SCENE_BODIES, focusId.replace('body-', ''), 'scene body');
      return Math.atan(bodyFootprintRadiusM(body) / SCALE_UNITS.MPC_TO_M / pose.distance);
    };
    const earth = apparentRad('body-earth');
    for (const focusId of BODIES) expect(apparentRad(focusId)).toBeCloseTo(earth, 12);
  });

  it('refuses a body it cannot place, and an instant it cannot read', () => {
    expect(() => bodyPhasePose('body-vulcan', T, 315, FOV_Y_RAD)).toThrow(/no entry for id/);
    expect(() => bodyPhasePose('body-mars', 'last tuesday', 315, FOV_Y_RAD)).toThrow(/not a date/);
  });
});
