/**
 * RampAnchor — one colour stop for `rampLut`: either `[t, r, g, b]`
 * (alpha falls back to a linear ramp from t) or `[t, r, g, b, a]`
 * (alpha taken from the anchor).  `t ∈ [0, 1]` is the normalised
 * position along the LUT; r/g/b/a are 0..255.
 *
 * The two shapes can be mixed within an anchor list — any anchor with an
 * explicit alpha switches the *whole* LUT to per-anchor alpha
 * interpolation; otherwise the default linear-ramp behaviour applies.
 *
 * Why the union rather than always-explicit-alpha: sequential palettes
 * (viridis, magma, blue-purple, yellow-green) are colour-only and would
 * otherwise need explicit alpha at every anchor — noise that obscures
 * their intent.  Keeping `[t, r, g, b]` as the default makes those cases
 * concise and forces divergent palettes (which need V-shaped alpha) to
 * declare it.
 */

/** A colour stop for `rampLut`, with optional explicit alpha. */
export type RampAnchor =
  | readonly [t: number, r: number, g: number, b: number]
  | readonly [t: number, r: number, g: number, b: number, a: number];
