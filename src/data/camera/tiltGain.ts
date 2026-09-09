/**
 * The tilt handle's own rate multiplier (user feel ruling, 2026-09-03): tilting
 * spans ~90° of travel where orbit spans a hemisphere, so the shared
 * one-FOV-per-screen-height rate reads as sluggish there, and this breaks that
 * rate law for this handle only.
 */
export const TILT_GAIN = 1.6;
