/** The tilt handle's own rate multiplier (user feel ruling, 2026-09-03): it spans
 * ~90° where orbit spans a hemisphere, so it alone breaks the
 * one-FOV-per-screen-height rate law. */
export const TILT_GAIN = 1.6;
