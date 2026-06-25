/**
 * lensStrengthFromSlider — maps a [0, 1] slider position to a dimensionless
 * lensing strength multiplier.
 *
 * The mapping is linear in log-space: `10^(LOG_MIN + p*(LOG_MAX - LOG_MIN))`.
 * This means p = 0.25 lands at 1× (physical), and p = 1 yields 1000×
 * (wildly exaggerated for visual debugging). As p → 0⁺ the formula approaches
 * 0.1×, but p = 0 is a hard-off sentinel (see below) — the full four-decade
 * range [0.1, 1000] is therefore reachable by non-zero slider positions without
 * the low end becoming invisibly thin.
 *
 * `p = 0` is a hard-off sentinel that returns 0, not `10^-∞`. The formula
 * would approach 0.1 as p → 0, not 0, so the "no lensing" state needs its
 * own special case — a bare value of zero is unambiguous in the lens shader
 * (multiply by 0 = no deflection), whereas any positive value, however small,
 * would still apply a faint warp.
 *
 * `LOG_MIN` and `LOG_MAX` are exported so the inverse (`lensSliderFromStrength`)
 * can import them rather than re-declaring, keeping the decade range in one
 * place.
 */

export const LOG_MIN = -1;
export const LOG_MAX = 3;

/**
 * Maps slider position `p` (0–1) to a dimensionless lensing strength.
 *
 * `p <= 0` → 0 (hard off).
 * `p ∈ (0, 1]` → `10^(LOG_MIN + p*(LOG_MAX - LOG_MIN))`.
 */
export function lensStrengthFromSlider(p: number): number {
  if (p <= 0) return 0;
  return Math.pow(10, LOG_MIN + p * (LOG_MAX - LOG_MIN));
}
