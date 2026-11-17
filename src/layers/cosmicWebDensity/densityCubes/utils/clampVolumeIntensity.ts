/**
 * clampVolumeIntensity — clamps a volume overlay's master intensity (opacity
 * weight) to the [0, 1] unit range.
 *
 * ### Why unit range, not arbitrary
 *
 * The intensity scalar multiplies the final fragment alpha before blending
 * with the background.  Values above 1 would produce super-additive blending
 * (apparent opacity > 1 on a transparent render target) and can blow out the
 * final composite on HDR render targets.  Values below 0 would subtract from
 * the background colour — invisible to the user but technically invalid for
 * an opacity weight.
 *
 * The SettingsPanel slider is also bounded to [0, 1], so this clamp is
 * primarily a defensive boundary for programmatic callers.
 *
 * No `Number.isFinite` guard is intentional: the original `setIntensity`
 * setter used a bare `Math.max/min` with no finite check, so `NaN` passed
 * through — this helper preserves that per-knob behaviour exactly, matching
 * `clampVolumeContrast` (which has the same origin) rather than the guarded
 * exposure/trim/densityScale helpers whose originals did NaN-fallback.
 */
export function clampVolumeIntensity(value: number): number {
  return Math.max(0, Math.min(1, value));
}
