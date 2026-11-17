/**
 * clampLocalBubbleIntensity — fold the shell's intensity slider to the [0, 2]
 * range the settings section exposes, at the point of use rather than on the
 * settings write path (see `clampFilamentIntensity` for why the clamp lives
 * at consumption: the store keeps raw intent).
 */
export function clampLocalBubbleIntensity(intensity: number): number {
  return Math.max(0, Math.min(2, intensity));
}
