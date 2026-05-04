/**
 * cameraFraming — unit tests for the pure initial-camera helper.
 *
 * The math is small enough to verify exhaustively across a few synthetic
 * bbox scales (small / medium / huge) plus the FOV pass-through.  We rely
 * on `clampDistance` from orbitCamera (re-imported via the helper) to
 * cover the global zoom-envelope clamping behaviour at the extremes.
 */

import { describe, it, expect } from 'vitest';

import { computeInitialCamera, INITIAL_FRAME_FACTOR } from '../../../src/services/engine/cameraFraming';
import { MAX_DISTANCE_MPC, MIN_DISTANCE_MPC } from '../../../src/services/camera/orbitCamera';

describe('computeInitialCamera', () => {
  const FOV = (Math.PI / 180) * 60;

  it('places the target at the origin', () => {
    const cam = computeInitialCamera({ bbox: 200, fovYRad: FOV });
    expect(cam.target).toEqual([0, 0, 0]);
  });

  it('passes the FOV through unchanged', () => {
    const cam = computeInitialCamera({ bbox: 200, fovYRad: FOV });
    expect(cam.fovYRad).toBe(FOV);
  });

  it('uses stable yaw / pitch defaults so resetCamera is reproducible', () => {
    const cam = computeInitialCamera({ bbox: 200, fovYRad: FOV });
    expect(cam.yaw).toBe(0);
    expect(cam.pitch).toBe(0.3);
  });

  it('uses near = 0.01 Mpc (10 kpc) regardless of bbox', () => {
    const small = computeInitialCamera({ bbox: 1, fovYRad: FOV });
    const huge = computeInitialCamera({ bbox: 5000, fovYRad: FOV });
    expect(small.near).toBe(0.01);
    expect(huge.near).toBe(0.01);
  });

  it('scales distance by INITIAL_FRAME_FACTOR for in-envelope bboxes', () => {
    const bbox = 200;
    const cam = computeInitialCamera({ bbox, fovYRad: FOV });
    expect(cam.distance).toBeCloseTo(bbox * INITIAL_FRAME_FACTOR, 6);
  });

  it('scales far by 4× the bbox so the deepest points never clip', () => {
    const bbox = 250;
    const cam = computeInitialCamera({ bbox, fovYRad: FOV });
    expect(cam.far).toBeCloseTo(bbox * 4, 6);
  });

  it('clamps an oversized bbox so the camera never starts above MAX_DISTANCE_MPC', () => {
    // 5000 × 1.6 = 8000 Mpc, well above the 5000 Mpc envelope.
    const cam = computeInitialCamera({ bbox: 5000, fovYRad: FOV });
    expect(cam.distance).toBe(MAX_DISTANCE_MPC);
  });

  it('clamps a tiny bbox so the camera never starts below MIN_DISTANCE_MPC', () => {
    // 0.001 × 1.6 = 0.0016 Mpc, below the 0.05 Mpc floor.
    const cam = computeInitialCamera({ bbox: 0.001, fovYRad: FOV });
    expect(cam.distance).toBe(MIN_DISTANCE_MPC);
  });

  it('returns a fresh array for target on every call (no shared reference)', () => {
    const a = computeInitialCamera({ bbox: 100, fovYRad: FOV });
    const b = computeInitialCamera({ bbox: 100, fovYRad: FOV });
    expect(a.target).not.toBe(b.target);
  });
});
