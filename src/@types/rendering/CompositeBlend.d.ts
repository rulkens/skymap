/**
 * CompositeBlend — blend modes for compositing an offscreen texture into a target.
 *
 * The Compositor uses these modes to define how a source layer combines with
 * the destination. Each mode is a key in the Compositor's pipeline cache,
 * keyed by (blend, dstFormat) to amortize pipeline creation. In phase 2
 * (CompositeStep data), a step's blend mode will be carried alongside its
 * tone-map parameters as data in the frame program, rather than passed as a
 * per-draw call argument.
 */
export type CompositeBlend =
  // Overwrite destination (default HDR → swap: swap is cleared first).
  | 'replace'
  // Porter-Duff OVER; future consumer planned (foreground → swap).
  | 'over'
  // Add source into destination (no consumer yet; kept for symmetry).
  | 'additive';
