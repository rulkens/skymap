/**
 * clampVolumeDensityScale — collapses invalid densityScale values to 0 rather
 * than propagating them to the GPU.
 *
 * ### Why collapse instead of clamp
 *
 * A negative densityScale would invert the raymarch's alpha accumulation
 * integral `1 − exp(−densityScale · sample · step)`.  The integral is derived
 * assuming a non-negative extinction coefficient; a negative value yields
 * negative opacity, which produces a subtle colour subtraction bug that looks
 * like the volume is brightening the background instead of tinting it.  That
 * failure mode is hard to diagnose because nothing throws — the GPU just
 * renders wrong colours.
 *
 * Collapsing to 0 keeps the overlay fully invisible until a sane value
 * arrives, which is the safest fallback: invisible-but-correct beats
 * visible-but-wrong.  Non-finite values (NaN, ±Inf, -0) get the same
 * treatment — they should never appear in practice but would cause identical
 * GPU-side anomalies.
 */
export function clampVolumeDensityScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
