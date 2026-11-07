/**
 * AntiqueGlyphSheet — the digits and degree marks the plate's border is numbered in, set in IM
 * Fell once on a canvas: the bitmap plus each glyph's rect (px) on it.
 */
export type AntiqueGlyphSheet = {
  readonly bitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
  /** Every glyph's baseline, as a fraction of its rect's height from the top. */
  readonly baseline: number;
  readonly glyphs: Readonly<
    Record<
      string,
      { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
    >
  >;
};
