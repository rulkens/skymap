/**
 * sphereFitDistance — the whole-sphere framing distance a view's `fitRadiusMpc`
 * resolves against at fly time. Asserts the three properties the module
 * header promises: portrait beats landscape for the same radius, the returned
 * distance actually clears the limiting half-angle, and the shared clamp caps
 * a radius large enough to blow past `MAX_DISTANCE_MPC`.
 */
import { describe, it, expect } from 'vitest';

import { sphereFitDistance } from '../../../src/utils/camera/sphereFitDistance';
import { MAX_DISTANCE_MPC } from '../../../src/utils/camera/clampDistance';

const FOV_Y_RAD = (Math.PI / 180) * 60;

describe('sphereFitDistance', () => {
  it('sits the camera further back in portrait than landscape, for the same radius', () => {
    const landscape = sphereFitDistance(14300, FOV_Y_RAD, 16 / 9);
    const portrait = sphereFitDistance(14300, FOV_Y_RAD, 390 / 844);
    expect(portrait).toBeGreaterThan(landscape);
  });

  it('never lets the sphere exceed the limiting half-angle, at any aspect', () => {
    const radiusMpc = 14300;
    for (const aspect of [390 / 844, 1, 16 / 9]) {
      const d = sphereFitDistance(radiusMpc, FOV_Y_RAD, aspect);
      const halfFov = Math.atan(Math.tan(FOV_Y_RAD / 2) * Math.min(1, aspect));
      const subtended = Math.asin(radiusMpc / d);
      expect(subtended).toBeLessThanOrEqual(halfFov);
    }
  });

  it('clamps to MAX_DISTANCE_MPC for a radius large enough to blow past the ceiling', () => {
    const d = sphereFitDistance(1e9, FOV_Y_RAD, 1);
    expect(d).toBe(MAX_DISTANCE_MPC);
  });
});
