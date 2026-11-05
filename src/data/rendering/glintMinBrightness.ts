/**
 * glintMinBrightness — a glint whose final brightness is at or below this adds
 * nothing visible to the HDR accumulation. The body glints and the black-hole
 * marker both skip on it, so their "opacity 0 ⇒ no render" thresholds agree.
 */

export const GLINT_MIN_BRIGHTNESS = 1e-4;
