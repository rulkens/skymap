/**
 * Single source of truth for the padded billboard radius used by every
 * galaxy-disk renderer (points soft glow, procedural disk, textured
 * thumbnail).
 *
 * ## Why a shared helper
 *
 * The points bake, proceduralDiskSubsystem, and texturedDiskSubsystem
 * each used to compute the same '(diameterKpc * 2) / 1000' algebra
 * inline — three sites, one constant 4× padding factor + one 30-kpc
 * synthetic-fallback floor. A change to either (e.g. tightening the
 * padding) had to be replicated three times in lockstep; a missed edit
 * created a visible size mismatch at the load-fade crossfade boundary.
 *
 * Centralising the math also documents *what the 4× means*: each
 * renderer's quad expands to the same world-space footprint, so the
 * soft glow → procedural disk → textured thumbnail handoff happens at
 * fixed pixel boundaries without any pipeline being visibly larger or
 * smaller than the others at the crossfade.
 *
 * ## Return value convention
 *
 * Returns the padded *half-extent* (radius) in Mpc — the natural unit
 * for the points pipeline's billboard math. Subsystems that store the
 * *full quad extent* (procedural disk, textured thumbnail — both store
 * 'posSize.w' as diameter so their vertex stage can halve at corner
 * expansion) call this helper and double the result at the call site.
 * The doubling is explicit at each site to make the convention switch
 * visible rather than hidden inside the helper.
 */

/** Synthetic-fallback floor (kpc) for galaxies with missing or zero diameter. */
const SYNTHETIC_FALLBACK_DIAMETER_KPC = 30;

/** Padding multiplier; matches the textured-thumbnail's world footprint. */
const THUMBNAIL_FOOTPRINT_PADDING = 4;

export function paddedRadiusMpc(diameterKpc: number): number {
  const safeDKpc = diameterKpc > 0 ? diameterKpc : SYNTHETIC_FALLBACK_DIAMETER_KPC;
  return ((safeDKpc / 2) * THUMBNAIL_FOOTPRINT_PADDING) / 1000;
}
