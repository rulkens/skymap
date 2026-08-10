/**
 * pickPaddingPx — extra pixels added to a galaxy's `pointSizePx` for the pick
 * pass only, so a distant point-like galaxy (a 5 px dot at the default
 * 2.5 px floor → ~9 px with padding) gets a comfortable click target without
 * inflating what the user sees. Additive, so it scales with the size slider.
 *
 * Lives in its own pure data module (not `pickRenderer.ts`) so
 * `pickUniformBytesOf` — a GPU-free value packer — can read it without
 * importing a renderer module and dragging WESL shader imports into its
 * plain-value world. `structureMarker/ringPick` and `milkyWay/pick` bake the
 * same padding into their pick-widened floors; this is their one TS home.
 */

/** Extra pixels added to `pointSizePx` for the pick pass. */
export const PICK_PADDING_PX = 4;
