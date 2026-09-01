/**
 * clampDistance — the shared zoom envelope: ceiling `MAX_DISTANCE_MPC`, floor
 * whatever `floorMpc` the caller precomputed.
 *
 * `floorMpc` derivation (radius · standoff, MIN-floored, per-body override)
 * moved to `pivotFraming` (`pivotRadiusMpc.test.ts`) — these tests pin the
 * two-arg clamp itself. Distances near a body are written in BODY RADII
 * rather than Mpc so they assert the property ("outside the surface, close
 * to it") instead of restating the standoff constant.
 */

import { describe, it, expect } from 'vitest';
import {
  clampDistance,
  MIN_DISTANCE_MPC,
  MAX_DISTANCE_MPC,
  SURFACE_STANDOFF_RADII,
} from '../../../src/utils/camera/clampDistance';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { bodyFocusDistance } from '../../../src/services/engine/camera/bodyFocusDistance';

/**
 * The galaxy-focus tween's minimum end distance (0.15 Mpc) is the lowest
 * distance `galaxyFocusDistance()` can return — see
 * `src/services/engine/camera/galaxyFocusDistance.ts: MIN_FOCUS_DISTANCE_MPC`.
 * A sub-floor wheel-zoom input must not ratchet that distance outward;
 * `clampDistance(GALAXY_FOCUS_MIN_MPC, MIN_DISTANCE_MPC)` must return the
 * value unchanged.
 */
const GALAXY_FOCUS_MIN_MPC = 0.15;

/** Earth's mean radius (km → Mpc) — spelled out so the test owns its subject. */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

/** The floor a focus row with no standoff override resolves to — see `pivotFraming`. */
const EARTH_FLOOR_MPC = EARTH_RADIUS_MPC * SURFACE_STANDOFF_RADII;

describe('clampDistance — floor at the absolute minimum (no pivot: empty space, galaxy, structure)', () => {
  it('floors at MIN_DISTANCE_MPC', () => {
    // 1e-30 is well below the absolute floor.
    expect(clampDistance(1e-30, MIN_DISTANCE_MPC)).toBe(MIN_DISTANCE_MPC);
  });

  it('caps at MAX_DISTANCE_MPC', () => {
    // A distance beyond the observable-universe limit is clamped to MAX.
    expect(clampDistance(1e9, MIN_DISTANCE_MPC)).toBe(MAX_DISTANCE_MPC);
  });

  it('does not ratchet the galaxy focus-on end distance', () => {
    // The floor must never reach up into galaxy-focus territory: a focus
    // tween that ends at 0.15 Mpc has to pass through untouched, or every
    // galaxy focus would be pushed back out again.
    expect(clampDistance(GALAXY_FOCUS_MIN_MPC, MIN_DISTANCE_MPC)).toBe(GALAXY_FOCUS_MIN_MPC);
  });

  it('returns an in-bounds value unchanged', () => {
    const mid = 10; // 10 Mpc — squarely inside [1e-17, 30000]
    expect(clampDistance(mid, MIN_DISTANCE_MPC)).toBe(mid);
  });
});

describe('clampDistance — floored at a precomputed body surface', () => {
  it('zooming in repeatedly settles just OUTSIDE the surface, never inside', () => {
    // Simulate the real gesture: exponential wheel ticks, each ~10% closer, far
    // more of them than it takes to blow through the planet (0.9^300 ≈ 1e-14).
    let distance = EARTH_RADIUS_MPC * 10;
    for (let i = 0; i < 300; i++) {
      distance = clampDistance(distance * 0.9, EARTH_FLOOR_MPC);
    }

    const radii = distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1); // outside the surface — the bug was 0.048
    expect(radii).toBeLessThan(1.05); // and close enough to inspect it
  });

  it('leaves the body-framing distance untouched — only a deliberate zoom reaches the floor', () => {
    // Cross-check between two constants that have to stay ordered: the standoff
    // must sit INSIDE the screen-fill framing distance, or every fresh body focus
    // would be clamped and land somewhere other than where the framing asked for.
    const framing = bodyFocusDistance(EARTH_RADIUS_MPC, (Math.PI / 180) * 60);
    expect(clampDistance(framing, EARTH_FLOOR_MPC)).toBe(framing);
  });
});
