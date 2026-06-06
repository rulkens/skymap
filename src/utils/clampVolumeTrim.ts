/**
 * clampVolumeTrim — clamps the low-signal trim threshold to [0, 0.95] and
 * maps non-finite inputs to 0.0 (no trim).
 *
 * ### What the trim threshold does
 *
 * The raymarch discards (alpha = 0) any sample whose normalised density falls
 * below the trim threshold.  This culls the void between filaments so the
 * overlay reads as structure rather than a diffuse haze.  A threshold of 0
 * disables trimming entirely; a threshold approaching 1 would suppress
 * everything including real structure.
 *
 * ### Why 0.95 as the ceiling
 *
 * The upper bound prevents the user from accidentally trimming 100% of the
 * field (which would produce a blank overlay and look like a bug).  0.95
 * retains the top 5% of the density distribution, which always includes the
 * densest filament cores — the structure is never completely hidden.
 *
 * ### Why 0.0 for NaN / ±Inf
 *
 * Falling back to 0.0 (no trim) is the safest default: all data stays visible
 * rather than being silently discarded.
 */
export function clampVolumeTrim(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(0.95, value)) : 0.0;
}
