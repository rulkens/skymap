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
  SURFACE_STANDOFF_RADII,
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

describe('clampDistance — per-body standoff', () => {
  it('floors at the given ratio instead of SURFACE_STANDOFF_RADII', () => {
    // Sgr A*'s descent floor (2 r_s) is far outside the Earth-tuned global
    // ratio, so a body that opts in must be floored at ITS OWN multiple, not
    // the shared constant.
    const radiusMpc = EARTH_RADIUS_MPC; // any body radius exercises the same math
    const belowFloor = radiusMpc * 0.5; // deep inside the body
    expect(clampDistance(belowFloor, radiusMpc, 2.0)).toBeCloseTo(radiusMpc * 2.0, 30);
  });

  it('omitted standoffRadii keeps Earth’s current floor unchanged', () => {
    // The zero-change proof: every existing two-arg call site (every body that
    // doesn't carry a `standoffRadii` override) must be byte-identical to
    // today's behaviour.
    const belowFloor = EARTH_RADIUS_MPC * 0.5;
    expect(clampDistance(belowFloor, EARTH_RADIUS_MPC)).toBe(
      clampDistance(belowFloor, EARTH_RADIUS_MPC, SURFACE_STANDOFF_RADII),
    );
  });
});
