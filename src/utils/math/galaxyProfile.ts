/**
 * galaxyProfile — pure brightness functions for the procedural galaxy
 * impostor.
 *
 * The impostor's fragment stage shades a 3D-oriented quad with a
 * two-component brightness profile that approximates a real galaxy:
 *
 *   - A Gaussian bulge concentrated at the centre (mimics the de
 *     Vaucouleurs / Sérsic n≈4 light distribution of a stellar bulge,
 *     without the cost of a true Sérsic call which needs an iterative
 *     gamma function lookup).
 *
 *   - An exponential disk extending out to the impostor's edge (Sérsic
 *     n=1 — the canonical thin-disk profile for spiral galaxies).
 *
 * Both functions take a normalised radius `r` where r=0 is the galaxy
 * centre and r=1 is the apparent edge of the impostor's billboard quad.
 * Everything beyond r=1 should be treated as zero (we don't extrapolate
 * the tails — the renderer's quad-edge `discard` handles that cleanly).
 *
 * Why pure JS helpers + WGSL re-implementation instead of just WGSL?
 * Because the WGSL math is hard to test directly — there's no GPU-side
 * unit-test framework in this project.  Implementing the formulas as
 * pure TS and unit-testing them gives us a reference oracle: when the
 * shader's output looks wrong in-browser, we can compare visually
 * against what these helpers would produce on the CPU at the same r.
 */

const BULGE_SIGMA = 0.4;
const DISK_SCALE = 0.5;

/**
 * Gaussian bulge component, peaked at r=0 with σ = BULGE_SIGMA.
 *
 * `B(r) = exp(-r² / (2σ²))`.  Returns values in [0, 1].
 *
 * The 0.4 σ choice puts the bulge's half-power point at roughly r=0.47
 * — a visually believable inner-third "core" that fades cleanly into
 * the surrounding disk by r=0.7 or so.  Tighter values make the core
 * look like a hot dot; looser values fight the disk's exponential
 * falloff and make the galaxy look uniform.
 */
export function bulgeBrightness(r: number): number {
  return Math.exp(-(r * r) / (2 * BULGE_SIGMA * BULGE_SIGMA));
}

/**
 * Exponential disk component (Sérsic n=1), peaked at r=0 with scale
 * radius DISK_SCALE.
 *
 * `D(r) = exp(-r / scaleRadius)`.  Returns values in [0, 1] for r ∈ [0, ∞).
 *
 * The 0.5 scale-radius choice places the disk's 1/e point at half the
 * impostor radius, leaving a visible fainter outer halo that fades to
 * ~13.5 % at the quad edge (r=1).  Below the disk-rendering threshold
 * the contribution is negligible and the quad-edge discard kicks in.
 */
export function diskBrightness(r: number): number {
  return Math.exp(-r / DISK_SCALE);
}

/**
 * Combine the two components with caller-supplied weights.  Typical
 * weights for a Sb spiral would be `bulgeWeight=0.5, diskWeight=0.5`;
 * an Sa-type galaxy with a strong bulge might use `0.7 / 0.3`; an Sd
 * with no significant bulge would use `0.2 / 0.8` or even `0.0 / 1.0`.
 *
 * For the v1 of the impostor we use a single fixed `0.6 / 0.4` blend
 * everywhere — see Task 5's fragment shader.  Per-galaxy Hubble-type
 * dispatch is parked as future work (the type strings are sparse outside
 * Famous + a few catalog rows).
 *
 * Returns values in [0, bulgeWeight + diskWeight] (typically [0, 1] when
 * the weights sum to 1).
 */
export function combinedBrightness(r: number, bulgeWeight: number, diskWeight: number): number {
  return bulgeBrightness(r) * bulgeWeight + diskBrightness(r) * diskWeight;
}
