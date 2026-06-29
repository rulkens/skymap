/**
 * toneMapDefaults — shared tone-map curve parameters.
 *
 * The HDR scene and the foreground (Sun, Earth, later an atmosphere) are
 * tone-mapped in two separate passes — the scene by `postProcess`, the
 * foreground by `foregroundComposite` after the UI overlay — but they MUST
 * use the same curve so a foreground body shares the background's response
 * across the limb.  These two constants are the curve's free parameters;
 * keeping them here means both passes read one source instead of drifting.
 */

/** Reinhard-extended whitepoint — input value where the curve reaches 1.0. */
export const TONEMAP_WHITEPOINT = 4.0;

/** Asinh stretch softness — higher = more aggressive low-end lift. */
export const TONEMAP_ASINH_SOFTNESS = 10.0;
