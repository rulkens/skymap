/**
 * earthHomePose — the home pose must land the eye on Earth's sunlit side, offset
 * from the pure-sunward axis by the terminator constant, and frame Earth exactly
 * as body focus does (so the tween→follow handoff is seamless).
 *
 * The ephemeris is analytic, so these run against a real sim instant with no
 * mocking. Earth in the equatorial world frame sits well off the xz-plane (its
 * declination is non-zero), so the terminator rotation about world Y swings the
 * AZIMUTH by exactly the offset while the full 3D angle to the sun axis is
 * smaller — the azimuth is the deterministic thing to pin.
 */

import { describe, expect, it } from 'vitest';
import {
  earthHomePose,
  HOME_TERMINATOR_OFFSET_RAD,
} from '../../../../src/services/engine/camera/earthHomePose';
import { bodyLikeFraming } from '../../../../src/services/engine/camera/bodyLikeFraming';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const FOV_Y_RAD = (Math.PI / 180) * 45;
// An arbitrary live instant; deriveBodyStates is analytic, so no clock needed.
const SIM_DAYS = CONST_J2000 + 1234.5;

const earthPos = deriveBodyStates(SIM_DAYS).get('earth')!.positionMpc;
const pose = earthHomePose(SIM_DAYS, FOV_Y_RAD);

// The orbit convention places the eye at target + distance·dir with dir pointing
// target→eye; reconstruct that eye-offset direction from the returned angles.
const dir: Vec3 = [
  Math.cos(pose.pitch) * Math.sin(pose.yaw),
  Math.sin(pose.pitch),
  Math.cos(pose.pitch) * Math.cos(pose.yaw),
];
const sunMag = Math.hypot(earthPos[0], earthPos[1], earthPos[2]);
const sunward: Vec3 = [-earthPos[0] / sunMag, -earthPos[1] / sunMag, -earthPos[2] / sunMag];

describe('earthHomePose', () => {
  it('places the eye on the sunlit side of Earth', () => {
    const dot = dir[0] * sunward[0] + dir[1] * sunward[1] + dir[2] * sunward[2];
    expect(dot).toBeGreaterThan(0);
  });

  it('offsets the eye azimuth from the sun axis by the terminator constant', () => {
    const azDir = Math.atan2(dir[0], dir[2]);
    const azSun = Math.atan2(sunward[0], sunward[2]);
    // Shortest signed azimuth difference.
    const delta = Math.atan2(Math.sin(azDir - azSun), Math.cos(azDir - azSun));
    expect(delta).toBeCloseTo(HOME_TERMINATOR_OFFSET_RAD);
  });

  it('targets and frames Earth exactly as body focus does', () => {
    const framing = bodyLikeFraming(earthPos, SCENE_EARTH.radiusKm, FOV_Y_RAD);
    expect(pose.target).toEqual(framing.target);
    expect(pose.distance).toBe(framing.distance);
  });
});
