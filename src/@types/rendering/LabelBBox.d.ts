/**
 * LabelBBox — the ink bounding box of a laid-out label, in atlas pixels,
 * relative to the label's anchor (`Label.worldPos` projected to screen).
 *
 * Produced by `measureLabel` from the same `layoutLabel` output the
 * vertex shader consumes, AFTER the alignX/alignY shifts — so the box
 * already sits where the text sits relative to the anchor (a
 * baseline-aligned label has `maxY ≈ 0` with the ink extending into
 * negative Y; a centered label straddles zero on both axes).
 *
 * Axis convention matches the atlas/layout space: +Y is DOWN (below the
 * baseline).  The label vertex shader's double negation (atlas-Y flip
 * into clip space, then the NDC→screen flip) makes atlas +Y and screen
 * +Y agree, so consumers scale this box by `displayEmPx / ATLAS_FONT_SIZE`
 * and add it to the projected anchor without any sign fix-up.
 */
export type LabelBBox = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};
