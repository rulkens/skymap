/**
 * CompositeBlend — blend modes for compositing an offscreen texture into a target.
 *
 * The Compositor uses these modes to define how a source layer combines with
 * the destination. Each mode is a key in the Compositor's pipeline cache,
 * keyed by (blend, dstFormat) to amortize pipeline creation.
 */

/**
 * Blend mode for the Compositor.
 *
 * - `'replace'` — overwrite destination (default HDR → swap: swap is cleared first).
 * - `'over'` — Porter-Duff OVER; future consumer planned (foreground → swap).
 * - `'additive'` — add source into destination (no consumer yet; kept for symmetry).
 */
export type CompositeBlend = 'replace' | 'over' | 'additive';
