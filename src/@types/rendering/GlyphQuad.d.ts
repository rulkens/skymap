/**
 * GlyphQuad — one laid-out glyph's per-vertex attribute tuple, as
 * produced by `layoutLabel`.  Coordinates live in atlas-pixel space
 * relative to the label's pen origin; the vertex shader applies the
 * world-anchor + scale transforms.
 */
export type GlyphQuad = {
  /** Pen-relative position of the glyph's top-left corner, in atlas pixels. */
  localOffsetX: number;
  localOffsetY: number;
  /** Glyph plane size in atlas pixels. */
  localSizeW: number;
  localSizeH: number;
  /** Atlas UVs in [0,1]. */
  uvU0: number;
  uvV0: number;
  uvU1: number;
  uvV1: number;
};
