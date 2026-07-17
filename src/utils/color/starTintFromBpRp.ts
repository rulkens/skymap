/**
 * starTintFromBpRp — the CPU evaluation of starCatalog/tint.wesl's `starTint`,
 * the ONE canonical Gaia BP−RP → linear-RGB stellar-tint ramp.
 *
 * ## Why a CPU twin exists
 *
 * The GPU ramp tints every survey-star point by its dequantized BP−RP colour.
 * When a star is focused, the picked-star sphere (Task 8d) is painted on the
 * CPU from the same row's `bpRp`, and it must land the SAME colour as the
 * point cloud it rose out of. Rather than pick a second, freely-drifting
 * blackbody path (that is `temperatureToLinearRgb`, which keys on kelvin — a
 * different input domain, deliberately independent), we mirror the exact
 * BP−RP ramp here. This function and `starCatalog/tint.wesl`'s `starTint` are
 * two evaluations of ONE ramp and must be kept in lockstep: any change to the
 * anchors or breakpoints in the WESL must be mirrored here (and vice versa),
 * and the tests in `starTintFromBpRp.test.ts` guard the shared values.
 *
 * ## Anchors and breakpoints (copied VERBATIM from tint.wesl:48-58)
 *
 *   ob = vec3(0.6, 0.7, 1.0)    // O/B blue-white   at BP−RP -0.30
 *   af = vec3(1.0, 1.0, 0.98)   // A/F white        at BP−RP  0.30
 *   gc = vec3(1.0, 0.97, 0.85)  // G yellow-white   at BP−RP  0.85
 *   kc = vec3(1.0, 0.85, 0.65)  // K orange         at BP−RP  1.25
 *   mc = vec3(1.0, 0.6, 0.4)    // M red            at BP−RP  2.20
 *
 * ## Why the chained saturating mixes
 *
 * We reproduce the WESL form exactly: start at the bluest anchor, then apply
 * one `mix(running, anchor, saturate((bpRp - lo) / (hi - lo)))` per segment.
 * Each step only activates once `bpRp` passes that segment's low breakpoint,
 * and by then the running value already equals the segment's start anchor
 * (every earlier interpolant saturated to 1). So the sequence evaluates the
 * correct piecewise-linear ramp with clamped flat ends — the bluest anchor
 * below the first breakpoint, the reddest above the last — with no branch.
 * Matching the GPU's op sequence (not a re-derived closed form) is what keeps
 * the two evaluations bit-for-bit aligned across future edits.
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** Clamp one interpolant to [0, 1] — the WESL `saturate`. */
function saturate(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** Componentwise linear interpolation, the WESL `mix`. */
function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Gaia BP−RP colour → linear RGB (0..1), the shape `starRenderer.draw`
 * expects. Evaluates the same ramp as `starCatalog/tint.wesl`'s `starTint`.
 */
export function starTintFromBpRp(bpRp: number): Vec3 {
  // Spectral-class anchors (linear RGB) — VERBATIM from tint.wesl.
  const ob: Vec3 = [0.6, 0.7, 1.0]; // O/B blue-white
  const af: Vec3 = [1.0, 1.0, 0.98]; // A/F white
  const gc: Vec3 = [1.0, 0.97, 0.85]; // G yellow-white
  const kc: Vec3 = [1.0, 0.85, 0.65]; // K orange
  const mc: Vec3 = [1.0, 0.6, 0.4]; // M red

  let c: Vec3 = ob;
  c = mix(c, af, saturate((bpRp - -0.3) / (0.3 - -0.3)));
  c = mix(c, gc, saturate((bpRp - 0.3) / (0.85 - 0.3)));
  c = mix(c, kc, saturate((bpRp - 0.85) / (1.25 - 0.85)));
  c = mix(c, mc, saturate((bpRp - 1.25) / (2.2 - 1.25)));
  return c;
}
