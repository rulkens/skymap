/**
 * zoomedDistance — unit tests for the altitude-taper zoom model.
 *
 * The behaviour worth pinning is the CLAIM the module's docstring makes:
 *
 *   1. Near a pivot's surface, successive zoom-in notches shrink (a taper)
 *      and never overshoot the standoff floor.
 *   2. Far from a pivot (every astronomical viewing distance), the result is
 *      indistinguishable from the old `distance * factor` model — so this
 *      change doesn't alter deep-space zoom feel.
 *   3. With no pivot radius, the proportional model applies exactly, not
 *      approximately.
 *
 * These are the properties that can actually regress (e.g. someone "simplifies"
 * the altitude arithmetic back to a plain multiply, or breaks the far-field
 * approximation) — not a restatement of the formula itself.
 */

import { describe, it, expect } from 'vitest';

import { zoomedDistance } from '../../../src/utils/camera/zoomedDistance';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

/** Earth's mean radius (km → Mpc). */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

describe('zoomedDistance', () => {
  it('tapers into the standoff floor: zoom-in steps shrink and never overshoot it', () => {
    // Zoom in repeatedly from a comfortable orbital altitude (4 radii) with a
    // gentle per-notch factor. Under the OLD proportional-in-distance model
    // this walks distance to zero in a handful of notches; under the taper it
    // should approach the floor with ever-smaller steps and never cross it.
    const factor = 0.9;
    let distance = EARTH_RADIUS_MPC * 4;
    const floor = EARTH_RADIUS_MPC * SURFACE_STANDOFF_RADII;
    const stepSizes: number[] = [];

    for (let i = 0; i < 8; i++) {
      const next = zoomedDistance(distance, factor, EARTH_RADIUS_MPC);
      // Never overshoots below the standoff floor.
      expect(next).toBeGreaterThanOrEqual(floor - 1e-30);
      // Each notch is still a zoom-IN (distance strictly decreases) until it
      // settles at the floor.
      expect(next).toBeLessThanOrEqual(distance);
      stepSizes.push(distance - next);
      distance = next;
    }

    // The taper: absolute step size shrinks monotonically as the camera nears
    // the surface (this is what makes the final approach feel controllable
    // instead of slamming into the clamp in one notch).
    for (let i = 1; i < stepSizes.length; i++) {
      expect(stepSizes[i]!).toBeLessThan(stepSizes[i - 1]!);
    }

    // Keep zooming in for many more notches: the shrinking steps mean the
    // camera settles AT the floor rather than ever crossing it — the
    // asymptotic approach the taper is meant to produce.
    for (let i = 0; i < 100; i++) {
      distance = zoomedDistance(distance, factor, EARTH_RADIUS_MPC);
    }
    expect(distance).toBeCloseTo(floor, 9);
  });

  it('matches the plain proportional model far from the pivot (deep-space feel is unchanged)', () => {
    // At a distance millions of times the pivot's radius, the altitude and the
    // raw distance are the same number to within float precision, so the
    // taper must degenerate to the old `distance * factor` model.
    const distance = EARTH_RADIUS_MPC * 1e6;
    const factor = 0.87;
    const plainModel = distance * factor;

    const result = zoomedDistance(distance, factor, EARTH_RADIUS_MPC);

    expect(Math.abs(result - plainModel) / plainModel).toBeLessThan(1e-5);
  });

  it('with no pivot radius, scales distance proportionally with no taper', () => {
    // null means "no surface to taper against" — deep space, a galaxy, a
    // structure. The taper must not engage; distance scales exactly as it did
    // before this change existed.
    expect(zoomedDistance(100, 2, null)).toBe(200);
    expect(zoomedDistance(100, 0.5, null)).toBe(50);
  });

  it('falls back to the proportional model (still respecting the floor) if already at or below the surface', () => {
    // A state the clamp is supposed to prevent, but if it ever occurs, halving
    // an already-negative-or-zero altitude has no sensible taper — the
    // fallback should still land the camera on the standoff floor rather than
    // diverging or returning something below the pivot's surface.
    const distance = EARTH_RADIUS_MPC * 0.5; // already inside the body
    const result = zoomedDistance(distance, 0.9, EARTH_RADIUS_MPC);
    expect(result).toBeCloseTo(EARTH_RADIUS_MPC * SURFACE_STANDOFF_RADII, 12);
  });
});
