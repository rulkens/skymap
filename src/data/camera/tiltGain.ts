/**
 * The tilt handle's own rate multiplier (user feel ruling, 2026-09-03):
 * tilting spans ~90° of travel where orbit spans a hemisphere, so the
 * one-FOV-per-screen-height rate reads as sluggish there and this breaks it
 * for that handle only. See `draggedSurfacePose`'s tilt block for the sign
 * and floor rulings this constant feeds.
 */
export const TILT_GAIN = 1.6;
