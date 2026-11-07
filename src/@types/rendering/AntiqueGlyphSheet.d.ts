/**
 * AntiqueGlyphSheet — the digits the plate's border is numbered in, set in IM
 * Fell once on a canvas: the bitmap plus each glyph's rect (px) on it.
 */
export type AntiqueGlyphSheet = {
  readonly bitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
  readonly glyphs: Readonly<
    Record<
      string,
      { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
    >
  >;
};
