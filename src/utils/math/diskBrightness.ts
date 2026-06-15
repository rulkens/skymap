/**
 * Exponential disk component (Sérsic n=1) for the procedural galaxy
 * impostor, peaked at r=0 with scale radius DISK_SCALE.
 *
 * `D(r) = exp(-r / scaleRadius)`.  Returns values in [0, 1] for
 * r ∈ [0, ∞).  `r` is a normalised radius where r=0 is the galaxy centre
 * and r=1 is the apparent edge of the impostor's billboard quad.
 *
 * n=1 is the canonical thin-disk profile for spiral galaxies.  The 0.5
 * scale-radius choice places the disk's 1/e point at half the impostor
 * radius, leaving a visible fainter outer halo that fades to ~13.5 % at
 * the quad edge (r=1).  Below the disk-rendering threshold the
 * contribution is negligible and the quad-edge discard kicks in.
 *
 * Provided as a pure TS helper (mirrored in WGSL) so the formula has a
 * CPU-side reference oracle for the otherwise-untestable shader math.
 */

const DISK_SCALE = 0.5;

export function diskBrightness(r: number): number {
  return Math.exp(-r / DISK_SCALE);
}
