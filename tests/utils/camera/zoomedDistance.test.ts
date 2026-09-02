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
import { MIN_DISTANCE_MPC, SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { PivotFraming } from '../../../src/@types/camera/PivotFraming';

/** Earth's mean radius (km → Mpc). */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;
/** The bundle a resolved Earth focus row resolves to (`pivotFraming`, no override). */
const EARTH_PIVOT: PivotFraming = {
  radiusMpc: EARTH_RADIUS_MPC,
  floorMpc: EARTH_RADIUS_MPC * SURFACE_STANDOFF_RADII,
};
/** No focused pivot — the absolute floor, no taper anchor. */
const NO_PIVOT: PivotFraming = { radiusMpc: null, floorMpc: MIN_DISTANCE_MPC };

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
      const next = zoomedDistance(distance, factor, EARTH_PIVOT);
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
      distance = zoomedDistance(distance, factor, EARTH_PIVOT);
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

    const result = zoomedDistance(distance, factor, EARTH_PIVOT);

    expect(Math.abs(result - plainModel) / plainModel).toBeLessThan(1e-5);
  });

  it('with no pivot radius, scales distance proportionally with no taper', () => {
    // null means "no surface to taper against" — deep space, a galaxy, a
    // structure. The taper must not engage; distance scales exactly as it did
    // before this change existed.
    expect(zoomedDistance(100, 2, NO_PIVOT)).toBe(200);
    expect(zoomedDistance(100, 0.5, NO_PIVOT)).toBe(50);
  });

  it('never ratchets a distance already inside the pivot floor outward', () => {
    // Reachable, and not by the camera being inside a body: a pose that left
    // the surface arm carries a range along its VIEW RAY, and the focused pivot
    // need not be the body it was engaged on. Disengaging from the Moon at
    // h/R 3.4 gives 5 907 km — under Earth's 6 371 km floor if Earth is the
    // focus row. Clamping UP to that floor moved the eye 464 km outward on ONE
    // notch (`zoomedPose` carries target/yaw/pitch, so |Δeye| = |Δdistance|):
    // the snap class the ray-target conversion fix exists to remove.
    const distance = 5907.2 * SCALE_UNITS.KM_TO_MPC;
    expect(distance).toBeLessThan(EARTH_PIVOT.floorMpc);

    // Zoom IN holds station rather than jumping out …
    expect(zoomedDistance(distance, 0.9, EARTH_PIVOT)).toBe(distance);
    // … and zoom OUT steps by the notch, so the pose can climb back out of the
    // floor under its own power and rejoin the taper.
    const out = zoomedDistance(distance, 1.1, EARTH_PIVOT);
    expect(out).toBeCloseTo(distance * 1.1, 12);
    expect(zoomedDistance(out, 1.1, EARTH_PIVOT)).toBeGreaterThan(out);
  });
});
