/**
 * The gauge for the analytic field's arbitrary flux units: the scalar at which
 * an exposure of 1.0 is the calibrated look. Hand-pinned by eye.
 *
 * Never reconstitute it from the sprite pass's `starIntensity` and `sizeScale`:
 * that coupling once drifted the field's exposure x2.4446 behind a retune of
 * those SPRITE knobs, and buys no parity anyway, since the sprite pass's light
 * also carries its `count`.
 */
export const FIELD_EXPOSURE_GAUGE = 0.0539;
