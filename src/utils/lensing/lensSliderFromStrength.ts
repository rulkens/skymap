/**
 * lensSliderFromStrength — inverse of `lensStrengthFromSlider`: recovers the
 * slider position that would produce a given strength multiplier.
 *
 * Used to seed the slider's displayed position from the stored `lensStrength`
 * state when the panel opens, so the knob always reflects the live value.
 *
 * `LOG_MIN` and `LOG_MAX` are imported from the forward map to guarantee the
 * two functions stay consistent — changing the decade range in one place
 * automatically keeps the inverse in sync.
 */

import { LOG_MIN, LOG_MAX } from './lensStrengthFromSlider';

/**
 * Maps a dimensionless lensing strength back to a slider position in [0, 1].
 *
 * `strength <= 0` → 0 (hard off / slider fully left).
 * Otherwise: `(log10(strength) - LOG_MIN) / (LOG_MAX - LOG_MIN)`, clamped to [0, 1].
 */
export function lensSliderFromStrength(strength: number): number {
  if (strength <= 0) return 0;
  const p = (Math.log10(strength) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return Math.min(1, Math.max(0, p));
}
