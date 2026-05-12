/**
 * RawBMFont — the raw shape of the BMFont JSON emitted by
 * `tools/buildFontAtlas.ts` (via msdf-bmfont-xml).  Consumed by
 * `parseFontMetrics` to produce a runtime-friendly `FontMetrics`.
 */
export type RawBMFont = {
  pages: string[];
  common: { lineHeight: number; base: number; scaleW: number; scaleH: number };
  info: { face: string; size: number };
  /** Top-level (NOT inside `info`) per msdf-bmfont-xml's JSON output. */
  distanceField: { fieldType: string; distanceRange: number };
  chars: Array<{
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    xoffset: number;
    yoffset: number;
    xadvance: number;
    page: number;
    chnl: number;
  }>;
  kernings?: Array<{ first: number; second: number; amount: number }>;
};
