/**
 * earthHomePose — the home pose must land the eye on Earth's sunlit side, offset
 * from the pure-sunward axis by the terminator constant as a true 3D phase
 * angle, and frame Earth exactly as body focus does (so the tween→follow
 * handoff is seamless).
 *
 * The ephemeris is analytic, so these run against a real sim instant with no
 * mocking.
 */

import { describe, expect, it } from 'vitest';
import {
  earthHomePose,
  HOME_TERMINATOR_OFFSET_RAD,
} from '../../../../src/services/engine/camera/earthHomePose';
import { bodyLikeFraming } from '../../../../src/services/engine/camera/bodyLikeFraming';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { updatePosition } from '../../../../src/utils/camera/updatePosition';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';

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

  it('offsets the eye from the sun axis by the terminator constant, as a true 3D angle', () => {
    const dot = dir[0] * sunward[0] + dir[1] * sunward[1] + dir[2] * sunward[2];
    const angle = Math.acos(dot);
    expect(angle).toBeCloseTo(HOME_TERMINATOR_OFFSET_RAD);
  });

  it('targets and frames Earth exactly as body focus does', () => {
    const framing = bodyLikeFraming(earthPos, SCENE_EARTH.radiusKm, FOV_Y_RAD);
    expect(pose.target).toEqual(framing.target);
    expect(pose.distance).toBe(framing.distance);
  });

  // The intended world-space aim earthHomePose points along: the sunward axis
  // swung toward the horizontal perpendicular by the terminator offset.
  const sMag = Math.hypot(earthPos[0], earthPos[1], earthPos[2]);
  const s: Vec3 = [earthPos[0] / sMag, earthPos[1] / sMag, earthPos[2] / sMag];
  const tRaw: Vec3 = [s[2], 0, -s[0]];
  const tMag = Math.hypot(tRaw[0], tRaw[1], tRaw[2]);
  const t: Vec3 = [tRaw[0] / tMag, tRaw[1] / tMag, tRaw[2] / tMag];
  const c = Math.cos(HOME_TERMINATOR_OFFSET_RAD);
  const sn = Math.sin(HOME_TERMINATOR_OFFSET_RAD);
  const aim: Vec3 = [c * s[0] + sn * t[0], c * s[1] + sn * t[1], c * s[2] + sn * t[2]];

  // Decode a pose the way the render path does — eye = target + distance·dir
  // through `poseBasis` — and return the camera's aim (target→...→ −dir, unit).
  const decodeAim = (p: ReturnType<typeof earthHomePose>): Vec3 => {
    const cam = {
      yaw: p.yaw,
      pitch: p.pitch,
      distance: 1,
      target: [0, 0, 0] as Vec3,
      poseBasis: ORIENTATION_FRAMES.ecliptic,
      position: [0, 0, 0] as Vec3,
    } as unknown as OrbitCamera;
    updatePosition(cam);
    // target is the origin and distance 1, so position IS dir (target→eye); the
    // camera looks back along −dir, so the aim is −position.
    return [-cam.position[0], -cam.position[1], -cam.position[2]];
  };

  it('encoded through the ecliptic basis, decodes back to the sunlit aim under that same basis', () => {
    const framed = earthHomePose(SIM_DAYS, FOV_Y_RAD, ORIENTATION_FRAMES.ecliptic);
    const decoded = decodeAim(framed);
    expect(decoded[0]).toBeCloseTo(aim[0]);
    expect(decoded[1]).toBeCloseTo(aim[1]);
    expect(decoded[2]).toBeCloseTo(aim[2]);

    // Teeth: a legacy-identity encode (no basis) decoded through the ecliptic
    // basis misses the aim — proving the parameter is load-bearing, not inert.
    const legacyDecoded = decodeAim(earthHomePose(SIM_DAYS, FOV_Y_RAD));
    const err = Math.hypot(
      legacyDecoded[0] - aim[0],
      legacyDecoded[1] - aim[1],
      legacyDecoded[2] - aim[2],
    );
    expect(err).toBeGreaterThan(0.1);
  });
});
