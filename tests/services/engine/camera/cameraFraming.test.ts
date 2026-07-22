/**
 * cameraFraming — unit tests for the pure initial-camera helper.
 *
 * The helper now boots into the Earth home pose (`earthHomePose`), so the one
 * load-bearing invariant is that the snapshot's pose is that helper's pose at
 * the boot instant, wrapped in the near/far/fov envelope. Pinning the pose
 * against `earthHomePose` regresses loudly if boot ever drifts back to the old
 * Milky-Way constants or clamps away the Earth-scale framing distance.
 */

import { describe, it, expect } from 'vitest';

import {
  computeInitialCamera,
  FAR_CLIP_MPC,
} from '../../../../src/services/engine/camera/cameraFraming';
import { earthHomePose } from '../../../../src/services/engine/camera/earthHomePose';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';

describe('computeInitialCamera', () => {
  const FOV = (Math.PI / 180) * 60;

  it('boots into the Earth home pose at the given sim instant', () => {
    const cam = computeInitialCamera({ fovYRad: FOV, simDays: CONST_J2000 });
    const home = earthHomePose(CONST_J2000, FOV);

    expect(cam.target).toEqual(home.target);
    expect(cam.yaw).toBe(home.yaw);
    expect(cam.pitch).toBe(home.pitch);
    expect(cam.distance).toBe(home.distance);
  });

  it('wraps the home pose in the near/far/fov envelope', () => {
    const cam = computeInitialCamera({ fovYRad: FOV, simDays: CONST_J2000 });
    expect(cam.fovYRad).toBe(FOV);
    expect(cam.near).toBe(0.01);
    expect(cam.far).toBe(FAR_CLIP_MPC);
  });
});
