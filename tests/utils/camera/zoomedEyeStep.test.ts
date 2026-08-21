/**
 * zoomedEyeStep — the closed-form zoom-to-cursor step.
 *
 * The contract is an IDENTITY: applying the returned (distance scale, lateral)
 * to the pose must put the eye exactly where `anchor + factor · (eye − anchor)`
 * says, with yaw/pitch untouched. The test reproduces that target position from
 * the definition rather than from the implementation, so it fails on any
 * mis-decomposition (a sign flip, the lateral folded into the distance term).
 *
 * Magnitudes are the real ones — Earth's radius is ~2e-16 Mpc, so every
 * assertion is RELATIVE. An absolute `toBeCloseTo` here would pass on any
 * arithmetic whatsoever.
 */

import { describe, it, expect } from 'vitest';

import { zoomedEyeStep } from '../../../src/utils/camera/zoomedEyeStep';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const R = 6371 * SCALE_UNITS.KM_TO_MPC;
/** The user's captured gate pose: 21,216 km altitude, eye 27,587 km from centre. */
const ALT = 21216 * SCALE_UNITS.KM_TO_MPC;
const CENTRE: Vec3 = [0, 0, 0];
const EYE: Vec3 = [0, 0, R + ALT];
/** A surface point 30° round the limb from the nadir — an OFF-axis anchor. */
const ANCHOR: Vec3 = [R * Math.sin(Math.PI / 6), 0, R * Math.cos(Math.PI / 6)];
const FLOOR = R * SURFACE_STANDOFF_RADII;

/** |a − b| / |b| — the only meaningful currency at 1e-16 Mpc. */
function relDiff(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / Math.hypot(b[0], b[1], b[2]);
}

/** The eye the step's (scale, lateral) actually produces, via the pose terms. */
function steppedEye(
  eye: Readonly<Vec3>,
  target: Readonly<Vec3>,
  step: { distanceScale: number; lateralMpc: Vec3 },
): Vec3 {
  const dx = eye[0] - target[0];
  const dy = eye[1] - target[1];
  const dz = eye[2] - target[2];
  const distance = Math.hypot(dx, dy, dz);
  const newDistance = distance * step.distanceScale;
  return [
    target[0] + step.lateralMpc[0] + (dx / distance) * newDistance,
    target[1] + step.lateralMpc[1] + (dy / distance) * newDistance,
    target[2] + step.lateralMpc[2] + (dz / distance) * newDistance,
  ];
}

describe('zoomedEyeStep', () => {
  it('puts the eye exactly where `anchor + factor · (eye − anchor)` says', () => {
    const factor = 0.9;
    const step = zoomedEyeStep(EYE, CENTRE, ANCHOR, CENTRE, FLOOR, factor);

    const expected: Vec3 = [
      ANCHOR[0] + factor * (EYE[0] - ANCHOR[0]),
      ANCHOR[1] + factor * (EYE[1] - ANCHOR[1]),
      ANCHOR[2] + factor * (EYE[2] - ANCHOR[2]),
    ];
    expect(relDiff(steppedEye(EYE, CENTRE, step), expected)).toBeLessThan(1e-12);
  });

  it('shifts the pivot PERPENDICULAR to the orbit axis, never along it', () => {
    // The decomposition is only exact if the two halves are orthogonal: an
    // along-axis component in the lateral would double-count the distance term,
    // and the pose would land somewhere other than where the anchor scaling
    // said. It is also why `distance` alone is a poor proxy for altitude — the
    // pivot slides sideways while the eye's radius changes on its own.
    const step = zoomedEyeStep(EYE, CENTRE, ANCHOR, CENTRE, FLOOR, 0.9);
    const axis: Vec3 = [0, 0, 1]; // (EYE − CENTRE) normalised
    const lateralLen = Math.hypot(...step.lateralMpc);
    const alongComponent =
      (step.lateralMpc[0] * axis[0] + step.lateralMpc[1] * axis[1] + step.lateralMpc[2] * axis[2]) /
      lateralLen;
    expect(lateralLen).toBeGreaterThan(0);
    expect(Math.abs(alongComponent)).toBeLessThan(1e-12);
  });

  it('stops the EYE at the standoff floor, however violent the tick', () => {
    // A trackpad flick can hand over a factor far past the surface in one tick.
    // The floor is on the eye's radius, not on `distance` — with an off-axis
    // anchor the two are not the same number (here the clamped eye ends up
    // 0.2 × the starting distance from the pivot, nowhere near the floor value
    // a distance-currency clamp would have produced).
    const step = zoomedEyeStep(EYE, CENTRE, ANCHOR, CENTRE, FLOOR, 1e-9);
    const eye = steppedEye(EYE, CENTRE, step);
    expect(Math.hypot(...eye) / FLOOR).toBeCloseTo(1, 9);
  });

  it('an eye already below the floor is brought back OUT, never pushed deeper', () => {
    // The state this has to survive is one the clamp itself produces: the eye
    // parked exactly on the floor, one float ulp either side of it. Partitioning
    // the roots on `sOut <= 1` leaves that case in a gap — neither arm fires, no
    // clamp applies, and the tick descends the full 10% of the slant range to a
    // near-limb anchor (tens of km, straight through the crust). The anchor here
    // is 20° round from the nadir, where that slant range is ~2,200 km.
    const nearLimb: Vec3 = [
      R * Math.sin((20 * Math.PI) / 180),
      0,
      R * Math.cos((20 * Math.PI) / 180),
    ];
    const sunkEye: Vec3 = [0, 0, FLOOR * (1 - 1e-12)];

    const step = zoomedEyeStep(sunkEye, CENTRE, nearLimb, CENTRE, FLOOR, 0.9);
    const eye = steppedEye(sunkEye, CENTRE, step);
    expect(Math.hypot(...eye) / FLOOR).toBeCloseTo(1, 9);
    expect(Math.hypot(...eye)).toBeGreaterThanOrEqual(Math.hypot(...sunkEye));
  });

  it('zooming out is never clamped by the floor', () => {
    const factor = 1.5;
    const step = zoomedEyeStep(EYE, CENTRE, ANCHOR, CENTRE, FLOOR, factor);
    const expected: Vec3 = [
      ANCHOR[0] + factor * (EYE[0] - ANCHOR[0]),
      ANCHOR[1] + factor * (EYE[1] - ANCHOR[1]),
      ANCHOR[2] + factor * (EYE[2] - ANCHOR[2]),
    ];
    expect(relDiff(steppedEye(EYE, CENTRE, step), expected)).toBeLessThan(1e-12);
  });
});
