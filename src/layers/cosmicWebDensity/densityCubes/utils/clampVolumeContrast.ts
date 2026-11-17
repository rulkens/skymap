/**
 * clampVolumeContrast — single source of truth for the contrast bound on a
 * scalar-volume overlay.
 *
 * ### Why a floor of 0.05, not zero
 *
 * The raymarch shader computes `1 / contrast` when building the transfer
 * function curve.  A zero contrast would produce a divide-by-zero (→ Inf or
 * NaN on the GPU), silently breaking every fragment in the volume.  The 0.05
 * floor keeps the reciprocal at most 20×, which is already a near-infinite
 * hard step that no real data mapping ever needs.
 *
 * ### Why a ceiling of 16
 *
 * 16× contrast already maps a tightly-packed dynamic range into a nearly
 * binary on/off ramp.  The slider exposed in SettingsPanel caps at a tighter
 * visual range (~4–8×); this setter API stays permissive so programmatic
 * callers (demo presets, automated tests) can explore the full physical range
 * without the UI ceiling blocking them.
 */
export function clampVolumeContrast(value: number): number {
  return Math.max(0.05, Math.min(16, value));
}
