/**
 * AntiqueOrnamentAtlas — the packed ornament sheet's layout, written by
 * `tools/antique/packOrnaments.ts` beside the image it describes. Rects in px.
 */
export type AntiqueOrnamentAtlas = {
  readonly width: number;
  readonly height: number;
  readonly sprites: Readonly<
    Record<
      string,
      { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
    >
  >;
  /** Each cartouche's blank field as an oval, normalised to its sprite: where a plate's title is set. */
  readonly interiors: Readonly<
    Record<
      string,
      { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }
    >
  >;
};
