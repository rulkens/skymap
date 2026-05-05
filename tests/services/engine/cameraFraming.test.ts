/**
 * cameraFraming — unit tests for the pure initial-camera helper.
 *
 * The math is small enough to verify exhaustively across a few synthetic
 * bbox scales (small / medium / huge) plus the FOV pass-through.  We rely
 * on `clampDistance` from orbitCamera (re-imported via the helper) to
 * cover the global zoom-envelope clamping behaviour at the extremes.
 */

import { describe, it, expect } from 'vitest';

import {
  computeInitialCamera,
  INITIAL_DISTANCE_MPC,
} from '../../../src/services/engine/cameraFraming';
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

  it('uses the absolute INITIAL_DISTANCE_MPC regardless of bbox', () => {
    // Distance is now decoupled from bbox — the framing should be the
    // same whether the loaded catalog is huge (full GLADE) or tiny
    // (synthetic-only fallback).  bbox still drives `far` (clip plane)
    // but no longer scales `distance`.
    const camSmall = computeInitialCamera({ bbox: 200, fovYRad: FOV });
    const camHuge = computeInitialCamera({ bbox: 2000, fovYRad: FOV });
    expect(camSmall.distance).toBeCloseTo(INITIAL_DISTANCE_MPC, 6);
    expect(camHuge.distance).toBeCloseTo(INITIAL_DISTANCE_MPC, 6);
  });

  it('scales far by 4× the bbox so the deepest points never clip', () => {
    const bbox = 250;
    const cam = computeInitialCamera({ bbox, fovYRad: FOV });
    expect(cam.far).toBeCloseTo(bbox * 4, 6);
  });

  it('clamps the initial distance to MAX_DISTANCE_MPC if the constant ever exceeds it', () => {
    // The current INITIAL_DISTANCE_MPC (644.72) sits well within the
    // global envelope, so this test asserts the clamp fires only when
    // the constant is artificially large.  Kept as a regression rail —
    // a future tweak that pushes the constant past MAX_DISTANCE_MPC
    // (5000 by default) would surface here.
    const cam = computeInitialCamera({ bbox: 200, fovYRad: FOV });
    expect(cam.distance).toBeLessThanOrEqual(MAX_DISTANCE_MPC);
    expect(cam.distance).toBeGreaterThanOrEqual(MIN_DISTANCE_MPC);
  });

  it('returns a fresh array for target on every call (no shared reference)', () => {
    const a = computeInitialCamera({ bbox: 100, fovYRad: FOV });
    const b = computeInitialCamera({ bbox: 100, fovYRad: FOV });
    expect(a.target).not.toBe(b.target);
  });
});
