/**
 * foregroundFrustum — unit tests for the adaptive near-field near/far bracket.
 *
 * The bracket tracks the camera's orbit distance so the foreground depth buffer
 * stays precise from galaxy scale down to Earth's surface, with two floors: a
 * strictly-positive near floor (degenerate-matrix guard) and a scene far floor
 * (`FAR_MIN_MPC`) that keeps the seeded orbit rings inside the frustum so they
 * don't clip and flicker.
 */

import { describe, it, expect } from 'vitest';

import { foregroundFrustum, FAR_MIN_MPC } from '../../../src/utils/camera/foregroundFrustum';

describe('foregroundFrustum', () => {
  it('returns near < far', () => {
    // Galaxy scale and Earth-surface scale — both must give a valid frustum.
    expect(foregroundFrustum(0.43).near).toBeLessThan(foregroundFrustum(0.43).far);
    expect(foregroundFrustum(1e-16).near).toBeLessThan(foregroundFrustum(1e-16).far);
  });

  it('near stays strictly positive at tiny distance', () => {
    // At Earth-surface distance the pure ratio underflows toward zero; the
    // floor keeps near > 0 so the perspective matrix never degenerates.
    expect(foregroundFrustum(1e-16).near).toBeGreaterThan(0);
  });

  it('near scales with distance', () => {
    // Above the near floor, 10x the distance gives strictly larger near.
    const base = foregroundFrustum(0.43).near;
    const tenX = foregroundFrustum(4.3).near;
    expect(tenX).toBeGreaterThan(base);
  });

  it('far never falls below the seeded-orbit floor', () => {
    // Earth-scale: the pure ratio (distance·100) is far below the seeded
    // orbits, so the floor takes over.
    expect(foregroundFrustum(1e-16).far).toBe(FAR_MIN_MPC);
    expect(foregroundFrustum(1e-15).far).toBe(FAR_MIN_MPC);
    // Galaxy scale: the ratio dominates and clears the floor.
    expect(foregroundFrustum(0.43).far).toBe(0.43 * 100);
    expect(foregroundFrustum(0.43).far).toBeGreaterThan(FAR_MIN_MPC);
  });
});
