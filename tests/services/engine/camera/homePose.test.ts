/**
 * homePose — unit tests for the committed home-pose helper.
 *
 * Pins the pose against `bodyHomePose` directly, so this regresses loudly if
 * boot ever drifts back to the old Milky-Way constants or clamps away the
 * Earth-scale framing distance.
 */

import { describe, it, expect, vi } from 'vitest';

import { homePose } from '../../../../src/services/engine/camera/homePose';
import {
  GALACTIC_DISC_FORWARD,
  INITIAL_DISTANCE_MPC,
} from '../../../../src/services/engine/camera/cameraFraming';
import { bodyHomePose } from '../../../../src/services/engine/camera/bodyHomePose';
import * as bodyHomePoseModule from '../../../../src/services/engine/camera/bodyHomePose';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { orbitAnglesLookingAlong } from '../../../../src/utils/camera/orbitAnglesLookingAlong';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { EARTH_HOME } from '../../../../src/data/selection/earthHome';
import { worldArmOf } from '../../../fixtures/worldArmOf';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

describe('homePose', () => {
  const FOV = (Math.PI / 180) * 60;

  it('frames the Earth home pose at the given sim instant', () => {
    const cam = worldArmOf(homePose(EARTH_HOME, FOV, CONST_J2000, ORIENTATION_FRAMES.ecliptic));
    const home = bodyHomePose('earth', CONST_J2000, FOV, ORIENTATION_FRAMES.ecliptic);

    expect(cam.target).toEqual(home.target);
    expect(cam.yaw).toBe(home.yaw);
    expect(cam.pitch).toBe(home.pitch);
    expect(cam.distance).toBe(home.distance);
  });

  it('frames the neutral Local-Group pose for a home-less composition', () => {
    const cam = worldArmOf(
      homePose({ ...EARTH_HOME, focus: null }, FOV, CONST_J2000, ORIENTATION_FRAMES.ecliptic),
    );
    const { yaw, pitch } = orbitAnglesLookingAlong(
      GALACTIC_DISC_FORWARD,
      ORIENTATION_FRAMES.ecliptic,
    );

    expect(cam.target).toEqual([0, 0, 0]);
    expect(cam.distance).toBe(INITIAL_DISTANCE_MPC);
    expect(cam.yaw).toBe(yaw);
    expect(cam.pitch).toBe(pitch);
  });

  it('commits a COPY of the body pose target, not bodyHomePose’s live array', () => {
    const sharedTarget: Vec3 = [1, 2, 3];
    const spy = vi
      .spyOn(bodyHomePoseModule, 'bodyHomePose')
      .mockReturnValue({ target: sharedTarget, yaw: 0, pitch: 0, distance: 5 });

    const cam = worldArmOf(homePose(EARTH_HOME, FOV, CONST_J2000, ORIENTATION_FRAMES.ecliptic));
    cam.target[0] = 99;

    expect(sharedTarget[0]).toBe(1);
    spy.mockRestore();
  });
});
