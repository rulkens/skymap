/**
 * Gaussian bulge component for the procedural galaxy impostor, peaked at
 * r=0 with σ = BULGE_SIGMA.
 *
 * `B(r) = exp(-r² / (2σ²))`.  Returns values in [0, 1].  `r` is a
 * normalised radius where r=0 is the galaxy centre and r=1 is the
 * apparent edge of the impostor's billboard quad.
 *
 * The Gaussian mimics the de Vaucouleurs / Sérsic n≈4 light distribution
 * of a stellar bulge without the cost of a true Sérsic call (which needs
 * an iterative gamma-function lookup).  The 0.4 σ choice puts the bulge's
 * half-power point at roughly r=0.47 — a visually believable inner-third
 * "core" that fades cleanly into the surrounding disk by r=0.7 or so.
 * Tighter values make the core look like a hot dot; looser values fight
 * the disk's exponential falloff and make the galaxy look uniform.
 *
 * Provided as a pure TS helper (mirrored in WGSL) so the formula has a
 * CPU-side reference oracle: the shader math is hard to unit-test
 * directly, but its output can be compared against this at the same r.
 */

const BULGE_SIGMA = 0.4;

export function bulgeBrightness(r: number): number {
  return Math.exp(-(r * r) / (2 * BULGE_SIGMA * BULGE_SIGMA));
}
