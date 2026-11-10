/**
 * The gauge for the analytic field's arbitrary flux units: the scalar at which
 * an exposure of 1.0 is the calibrated look. Hand-pinned by eye, so it carries
 * no derivation, only a landmine.
 *
 * It must not be reconstituted from the sprite pass's `starIntensity` and
 * `sizeScale`, which is what it was until the field's exposure drifted x2.4446
 * behind a retune of those two SPRITE knobs. That coupling cannot buy
 * sprite/field parity anyway: the sprite pass's light also carries its `count`,
 * so matching the other two terms tracks nothing.
 */
export const FIELD_EXPOSURE_GAUGE = 0.0539;
