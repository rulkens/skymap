/**
 * Per-font configuration.  `ttf` is a filename relative to
 * `data/raw/fonts/`; `charset` is the union of codepoints the bake
 * step embeds in this font's atlas.
 */
export type FontConfig = {
  readonly ttf: string;
  readonly charset: string;
};
