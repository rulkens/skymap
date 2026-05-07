/**
 * labelLayout — converts a text string into the per-glyph attribute
 * tuples the label vertex shader expects.  Pure and synchronous: no GPU
 * device, no fetch, no allocation beyond the returned array.
 *
 * Coordinate convention: pen starts at (0, 0) which is the LEFT edge of
 * the first glyph at the BASELINE.  X advances rightward by glyph
 * advance + kerning.  Y is in pixel units of the source atlas (so a
 * glyph with `yoffset = 2` sits 2 px below the baseline anchor).  The
 * vertex shader will apply scale and world-position transforms.
 *
 * Glyphs missing from the atlas are silently dropped — the alternative
 * (rendering a tofu box) needs special atlas slots and adds complexity
 * we don't need yet.  ASCII + a few unit symbols already cover every
 * label we plan to render.
 */
import type { FontMetrics } from './fontMetrics';
import { lookupGlyph } from './fontMetrics';

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

export function layoutLabel(text: string, metrics: FontMetrics): GlyphQuad[] {
  const quads: GlyphQuad[] = [];
  let penX = 0;
  let prevCodepoint: number | undefined;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const g = lookupGlyph(metrics, cp);
    if (!g) {
      prevCodepoint = undefined;
      continue;
    }
    if (prevCodepoint !== undefined) {
      const k = metrics.kerning.get(`${prevCodepoint},${cp}`);
      if (k) penX += k;
    }
    quads.push({
      localOffsetX: penX + g.offset.x,
      localOffsetY: g.offset.y,
      localSizeW: g.size.w,
      localSizeH: g.size.h,
      uvU0: g.uv.u0,
      uvV0: g.uv.v0,
      uvU1: g.uv.u1,
      uvV1: g.uv.v1,
    });
    penX += g.advance;
    prevCodepoint = cp;
  }
  return quads;
}
