/**
 * cameraFraming — unit tests for the pure initial-camera helper.
 *
 * The helper is constants-only now (no bbox dependency), so the tests
 * just pin the values that drive first paint.
 */

import { describe, it, expect } from 'vitest';

import {
  computeInitialCamera,
  INITIAL_DISTANCE_MPC,
  FAR_CLIP_MPC,
} from '../../../../src/services/engine/camera/cameraFraming';
import { MAX_DISTANCE_MPC, MIN_DISTANCE_MPC } from '../../../../src/services/camera/orbitCamera';

describe('computeInitialCamera', () => {
  const FOV = (Math.PI / 180) * 60;

  it('places the target at the origin', () => {
    const cam = computeInitialCamera({ fovYRad: FOV });
    expect(cam.target).toEqual([0, 0, 0]);
  });

  it('passes the FOV through unchanged', () => {
    const cam = computeInitialCamera({ fovYRad: FOV });
    expect(cam.fovYRad).toBe(FOV);
  });

  it('uses stable yaw / pitch defaults so the initial framing is reproducible', () => {
    const cam = computeInitialCamera({ fovYRad: FOV });
    expect(cam.yaw).toBe(3.0045);
    expect(cam.pitch).toBe(0.0609);
  });

  it('uses near = 0.01 Mpc (10 kpc)', () => {
    const cam = computeInitialCamera({ fovYRad: FOV });
    expect(cam.near).toBe(0.01);
  });

  it('uses INITIAL_DISTANCE_MPC for the orbit distance', () => {
    const cam = computeInitialCamera({ fovYRad: FOV });
    expect(cam.distance).toBeCloseTo(INITIAL_DISTANCE_MPC, 6);
  });

  it('uses FAR_CLIP_MPC for the far clip plane', () => {
    const cam = computeInitialCamera({ fovYRad: FOV });
    expect(cam.far).toBe(FAR_CLIP_MPC);
  });

  it('clamps the initial distance to the global zoom envelope', () => {
    const cam = computeInitialCamera({ fovYRad: FOV });
    expect(cam.distance).toBeLessThanOrEqual(MAX_DISTANCE_MPC);
    expect(cam.distance).toBeGreaterThanOrEqual(MIN_DISTANCE_MPC);
  });

  it('returns a fresh array for target on every call (no shared reference)', () => {
    const a = computeInitialCamera({ fovYRad: FOV });
    const b = computeInitialCamera({ fovYRad: FOV });
    expect(a.target).not.toBe(b.target);
  });
});
