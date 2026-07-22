/**
 * sampleConicalSpiral — N points along an ideal heliocentric spiral whose radius
 * grows geometrically from `r0` to `r1` over `turns` full revolutions, on a plane
 * tilted `inclineRad` off the xy-plane.
 *
 * This is the *ideal* path the star-spiral build snaps real stars onto: the
 * corridor picker (see `pickSpiralCorridorStars`) walks these sample points
 * outward and grabs the brightest star near each. Keeping the geometry a pure
 * function of an options object — no catalogue, no I/O — lets the build reshape
 * the path (more turns, a steeper tilt) and re-measure the snap without touching
 * the picker, and lets a test pin the curve's endpoints and winding exactly.
 *
 * ── Why geometric (log) radius growth, not linear ─────────────────────────
 *
 * A linear r(t) spends most of its samples in the sparse outer field and crowds
 * none near the Sun, so an equal-angle spiral would sweep huge empty arcs far out
 * while barely resolving the dense inner neighbourhood. Growing the radius
 * geometrically — `r(t) = r0 · (r1/r0)^t` — makes each turn cover the same
 * *ratio* of distance, so the sample spacing tracks the roughly scale-free fall
 * of stellar density around the Sun: fine steps close in, coarser steps far out.
 * The endpoints are hit exactly (`r(0) = r0`, `r(1) = r1`).
 *
 * ── The tilt: rotate the flat spiral about the x-axis ─────────────────────
 *
 * The spiral is generated flat in the xy-plane (`[r·cosθ, r·sinθ, 0]`) and then
 * rotated by `inclineRad` about the x-axis, so the path climbs out of the plane
 * as it winds. A flat, exactly-in-plane spiral would run along a degenerate great
 * circle of the sky and pick up an unnaturally co-planar string of stars; a
 * modest tilt breaks that symmetry and lets the corridor sweep a genuine 3D
 * neighbourhood. Rotating a z=0 point about x reduces to scaling the flat y into
 * the new (y, z) pair — `y' = y·cos i`, `z' = y·sin i` — the two-line form below.
 *
 * Positions are returned in the same length unit as `r0`/`r1` (parsecs, in the
 * star-spiral build); the function is unit-agnostic beyond that.
 */

import type { Vec3 } from '../../../src/@types/math/Vec3';

export type ConicalSpiralOptions = {
  /** Inner radius at t=0, in the caller's length unit (parsecs). Must be > 0. */
  readonly r0: number;
  /** Outer radius at t=1, same unit as `r0`. */
  readonly r1: number;
  /** Total revolutions swept from `r0` to `r1`. */
  readonly turns: number;
  /** Number of sample points to emit (≥ 1). */
  readonly samples: number;
  /** Plane tilt off the xy-plane, in radians, applied about the x-axis. */
  readonly inclineRad: number;
};

export function sampleConicalSpiral(opts: ConicalSpiralOptions): Vec3[] {
  const { r0, r1, turns, samples, inclineRad } = opts;
  const cosI = Math.cos(inclineRad);
  const sinI = Math.sin(inclineRad);
  const ratio = r1 / r0;

  const out: Vec3[] = [];
  for (let i = 0; i < samples; i++) {
    // A single-sample request has no span to divide; place it at the inner end.
    const t = samples === 1 ? 0 : i / (samples - 1);
    const r = r0 * ratio ** t;
    const theta = 2 * Math.PI * turns * t;
    const x = r * Math.cos(theta);
    const yFlat = r * Math.sin(theta);
    // Rotate the flat (x, yFlat, 0) point about the x-axis by `inclineRad`.
    out.push([x, yFlat * cosI, yFlat * sinI]);
  }
  return out;
}
