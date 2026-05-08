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
 *
 * ## Horizontal alignment
 *
 * The optional `alignX` parameter shifts every glyph's `localOffsetX`
 * after the layout pass so the label sits left of / centered on / right
 * of its anchor.  This is a pure post-pass shift on the same field the
 * shader already consumes, so the vertex stage doesn't need to know
 * about alignment — it just sees a different `localOffset.x` per glyph
 * and the world-anchor projection logic stays identical.
 *
 *   `'left'`    (default)  pen anchor = label's left edge   → text extends right
 *   `'center'`  pen anchor = label's horizontal center      → text spans both sides
 *   `'right'`   pen anchor = label's right edge             → text extends left
 *
 * The "you are here" marker uses `'center'` so the vertical line
 * passes through the middle of the text rather than its left edge.
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

/** Horizontal alignment of the rendered text relative to the label's world anchor. */
export type LabelAlignX = 'left' | 'center' | 'right';

export function layoutLabel(
  text: string,
  metrics: FontMetrics,
  alignX: LabelAlignX = 'left',
): GlyphQuad[] {
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

  // After the layout pass, `penX` holds the total advance width of the
  // string (sum of glyph advances + kerning).  Apply the alignment shift
  // by subtracting a fraction of that width from every glyph's offset.
  // Skipping the loop for the no-op 'left' case keeps the common path
  // allocation-free (no second pass over the quads array).
  if (alignX !== 'left' && quads.length > 0) {
    const shift = alignX === 'center' ? penX * 0.5 : penX;
    for (const q of quads) {
      q.localOffsetX -= shift;
    }
  }

  return quads;
}
