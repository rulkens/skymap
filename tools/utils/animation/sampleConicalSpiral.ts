/**
 * sampleConicalSpiral — points spaced uniformly ALONG THE ARC LENGTH of an ideal
 * heliocentric spiral whose radius grows geometrically from `r0` to `r1` over
 * `turns` full revolutions, on a plane tilted `inclineRad` off the xy-plane.
 *
 * This is the *ideal* path the star-spiral build snaps real stars onto: the
 * corridor picker (see `pickSpiralCorridorStars`) walks these sample points
 * outward and grabs the brightest star near each. Keeping the geometry a pure
 * function of an options object — no catalogue, no I/O — lets the build reshape
 * the path (more turns, a steeper tilt) and re-measure the snap without touching
 * the picker, and lets a test pin the curve's endpoints and winding exactly.
 *
 * ── Why space samples by arc length, not by the curve parameter t ───────────
 *
 * The obvious sampling — N points equally spaced in the parameter t — puts the
 * SAME number of visits on every revolution, because one turn is a fixed span of
 * t. But the inner turns have a tiny circumference and the outer turns a huge
 * one, so equal-visits-per-turn packs the inner spiral with visits parsecs (or
 * sub-parsec) apart while the outer spiral is sparse. The camera then aims at a
 * cluster of near-coincident inner knots and whips between them. Spacing samples
 * by arc length instead — equal parsecs of path between consecutive samples —
 * makes visit density scale-free: a tight inner turn earns few samples, a long
 * outer turn earns many, and the snap grabs stars at a roughly constant physical
 * cadence the whole way out. `spacingPc` is that cadence; the sample COUNT falls
 * out of the spiral's total length divided by the spacing.
 *
 * ── The tidy surprise: arc length is LINEAR in radius, so arc-uniform ═ ──────
 *    radius-uniform, and no numeric arc-length table is needed
 *
 * Write the flat curve as `r(t) = r0·ratio^t`, `θ(t) = w·t` with `ratio = r1/r0`,
 * `w = 2π·turns`. Its speed works out to a clean product: with `k = ln(ratio)`,
 * `|dP/dt| = r(t)·√(k² + w²)` — the θ cross-terms cancel and the x-axis tilt,
 * being a rotation, leaves lengths unchanged. Integrating that speed gives
 * `s(t) = (√(k²+w²) / k) · (r(t) − r0)`: the arc length travelled is directly
 * proportional to how far the radius has grown. So placing samples at equal arc
 * spacing is exactly placing them at equal RADIUS spacing — a linear radius
 * sweep from `r0` to `r1`. That collapses the whole "invert an arc-length table"
 * job into one closed form, which is both simpler and exactly deterministic (no
 * table-resolution constant to tune, no accumulated chord error).
 *
 * ── Why geometric (log) radius growth still matters ─────────────────────────
 *
 * The radius law `r(t) = r0·ratio^t` is what makes each turn cover the same
 * *ratio* of distance, so the winding tracks the roughly scale-free fall of
 * stellar density around the Sun: tight turns close in, wide turns far out. Note
 * the two are independent — the radii of the emitted SAMPLES come out linearly
 * spaced (that is the arc-uniform result above), while the ANGLE at each sample
 * follows the geometric law through `t = ln(r/r0)/ln(ratio)`. A regression of the
 * radius law to linear interpolation would leave the sample radii unchanged but
 * break the sample angles, which the winding/curvature tests catch.
 *
 * ── The tilt: rotate the flat spiral about the x-axis ─────────────────────
 *
 * The spiral is generated flat in the xy-plane (`[r·cosθ, r·sinθ, 0]`) and then
 * rotated by `inclineRad` about the x-axis, so the path climbs out of the plane
 * as it winds. A flat, exactly-in-plane spiral would run along a degenerate great
 * circle of the sky and pick up an unnaturally co-planar string of stars; a
 * modest tilt breaks that symmetry and lets the corridor sweep a genuine 3D
 * neighbourhood. Rotating a z=0 point about x reduces to scaling the flat y into
 * the new (y, z) pair — `y' = y·cos i`, `z' = y·sin i`. Being a pure rotation it
 * leaves both the radius (`|P| = r`) and the arc length unchanged.
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
  /** Arc-length step between consecutive samples, same unit as `r0` (> 0). */
  readonly spacingPc: number;
  /** Plane tilt off the xy-plane, in radians, applied about the x-axis. */
  readonly inclineRad: number;
};

export function sampleConicalSpiral(opts: ConicalSpiralOptions): Vec3[] {
  const { r0, r1, turns, spacingPc, inclineRad } = opts;
  const cosI = Math.cos(inclineRad);
  const sinI = Math.sin(inclineRad);
  const ratio = r1 / r0;
  const k = Math.log(ratio);
  const w = 2 * Math.PI * turns;

  // Closed-form total arc length (see the module header's derivation).
  const totalLen = (Math.sqrt(k * k + w * w) / k) * (r1 - r0);

  // How many samples fit at the requested cadence; always at least the two
  // endpoints so the outer radius is reached exactly.
  const count = Math.max(2, Math.round(totalLen / spacingPc) + 1);

  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    // Equal arc spacing ⟺ equal radius spacing: sweep the radius linearly, then
    // recover the geometric-law angle at that radius.
    const r = r0 + (i / (count - 1)) * (r1 - r0);
    const theta = w * (Math.log(r / r0) / k);
    const yFlat = r * Math.sin(theta);
    out.push([r * Math.cos(theta), yFlat * cosI, yFlat * sinI]);
  }
  return out;
}
