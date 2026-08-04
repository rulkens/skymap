/**
 * pickPaddingPx — extra pixels added to a galaxy's `pointSizePx` for the pick
 * pass only.
 *
 * The pick billboard is grown past the visible sprite so a distant point-like
 * galaxy (a 5 px-diameter dot at the default 2.5 px floor → ~9 px with padding)
 * has a comfortable click target without inflating what the user actually sees.
 * Additive so it scales with the user's size slider.
 *
 * This lives in a tiny pure data module — rather than inside `pickRenderer.ts`
 * — because the pick uniform is now shaped entirely by `pickUniformBytesOf`
 * (a GPU-free value packer). Homing the constant here lets that pure helper
 * read it without importing a renderer module (which would drag WESL shader
 * imports into the helper's plain-value world). The `structureMarker/ringPick`
 * and `milkyWay/pick` shaders bake the same padding into their pick-widened
 * floors; this is the one TS home the comments over there point back to.
 *
 * @module
 */

/** Extra pixels added to `pointSizePx` for the pick pass. */
export const PICK_PADDING_PX = 4;
