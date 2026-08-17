/**
 * clampDistance — the shared zoom envelope, and the per-pivot floor that stops
 * the camera at a framed body's surface.
 *
 * The floor is the interesting half. The camera dollies toward its orbit target,
 * which for a body is the CENTRE, so a global floor is meaningless in body radii:
 * the absolute floor (1e-17 Mpc ≈ 309 km) is 0.048 Earth radii, i.e. thousands of
 * km inside the planet. These tests are written in BODY RADII rather than Mpc so
 * they assert the property ("outside the surface, close to it") instead of
 * restating the standoff constant.
 */

import { describe, it, expect } from 'vitest';
import {
  clampDistance,
  MIN_DISTANCE_MPC,
  MAX_DISTANCE_MPC,
} from '../../../src/utils/camera/clampDistance';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { bodyFocusDistance } from '../../../src/services/engine/camera/bodyFocusDistance';

/**
 * The galaxy-focus tween's minimum end distance (0.15 Mpc) is the lowest
 * distance `galaxyFocusDistance()` can return — see
 * `src/services/engine/camera/galaxyFocusDistance.ts: MIN_FOCUS_DISTANCE_MPC`.
 * A sub-floor wheel-zoom input must not ratchet that distance outward;
 * `clampDistance(GALAXY_FOCUS_MIN_MPC, null)` must return the value unchanged.
 */
const GALAXY_FOCUS_MIN_MPC = 0.15;

/** Earth's mean radius (km → Mpc) — spelled out so the test owns its subject. */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

describe('clampDistance — no pivot radius (empty space, galaxy, structure)', () => {
  it('floors at MIN_DISTANCE_MPC', () => {
    // 1e-30 is well below the absolute floor.
    expect(clampDistance(1e-30, null)).toBe(MIN_DISTANCE_MPC);
  });

  it('caps at MAX_DISTANCE_MPC', () => {
    // A distance beyond the observable-universe limit is clamped to MAX.
    expect(clampDistance(1e9, null)).toBe(MAX_DISTANCE_MPC);
  });

  it('does not ratchet the galaxy focus-on end distance', () => {
    // The per-pivot floor must never reach up into galaxy-focus territory: a
    // focus tween that ends at 0.15 Mpc has to pass through untouched, or every
    // galaxy focus would be pushed back out again.
    expect(clampDistance(GALAXY_FOCUS_MIN_MPC, null)).toBe(GALAXY_FOCUS_MIN_MPC);
  });

  it('returns an in-bounds value unchanged', () => {
    const mid = 10; // 10 Mpc — squarely inside [1e-17, 30000]
    expect(clampDistance(mid, null)).toBe(mid);
  });
});

describe('clampDistance — pivoted on a body', () => {
  it('zooming in repeatedly settles just OUTSIDE the surface, never inside', () => {
    // Simulate the real gesture: exponential wheel ticks, each ~10% closer, far
    // more of them than it takes to blow through the planet (0.9^300 ≈ 1e-14).
    let distance = EARTH_RADIUS_MPC * 10;
    for (let i = 0; i < 300; i++) {
      distance = clampDistance(distance * 0.9, EARTH_RADIUS_MPC);
    }

    const radii = distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1); // outside the surface — the bug was 0.048
    expect(radii).toBeLessThan(1.05); // and close enough to inspect it
  });

  it('a body smaller than the absolute floor still gets the absolute floor', () => {
    // A 10 km moonlet's own standoff (~10.2 km) is far below MIN_DISTANCE_MPC
    // (~309 km), where the near-plane ratio stops being well conditioned. The
    // floor is a max of the two, so the absolute floor wins for tiny pivots.
    const moonletRadiusMpc = 10 * SCALE_UNITS.KM_TO_MPC;
    expect(clampDistance(1e-30, moonletRadiusMpc)).toBe(MIN_DISTANCE_MPC);
  });

  it('leaves the body-framing distance untouched — only a deliberate zoom reaches the floor', () => {
    // Cross-check between two constants that have to stay ordered: the standoff
    // must sit INSIDE the screen-fill framing distance, or every fresh body focus
    // would be clamped and land somewhere other than where the framing asked for.
    const framing = bodyFocusDistance(EARTH_RADIUS_MPC, (Math.PI / 180) * 60);
    expect(clampDistance(framing, EARTH_RADIUS_MPC)).toBe(framing);
  });
});
