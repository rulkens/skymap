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
 */
export function clampVolumeIntensity(value: number): number {
  return Math.max(0, Math.min(1, value));
}
