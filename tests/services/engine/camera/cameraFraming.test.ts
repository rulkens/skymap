/**
 * cameraFraming — unit tests for the pure initial-camera helper.
 *
 * The helper is constants-only now (no bbox dependency), so the tests
 * just pin the values that drive first paint.
 */

import { describe, it, expect } from 'vitest';

import { computeInitialCamera } from '../../../../src/services/engine/camera/cameraFraming';
import { MAX_DISTANCE_MPC, MIN_DISTANCE_MPC } from '../../../../src/utils/camera/clampDistance';

describe('computeInitialCamera', () => {
  const FOV = (Math.PI / 180) * 60;

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
