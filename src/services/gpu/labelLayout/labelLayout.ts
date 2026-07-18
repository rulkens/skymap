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
 *
 * ## Line breaks
 *
 * `'\n'` starts a new line: the pen returns to 0, the baseline drops by
 * the font's `lineHeight`, and kerning never carries across the break.
 * The alignX shift is applied PER LINE against that line's own width, so
 * a centered two-line label shares a centre rather than a left edge —
 * a global shift by the widest line would left-align the narrower one.
 * Wrapping (deciding WHERE to break) stays with the producer; this
 * module only honours breaks already present in the string.
 */
import type { FontMetrics } from '../../../@types/rendering/FontMetrics';
import type { GlyphQuad } from '../../../@types/rendering/GlyphQuad';
import type { LabelAlignX } from '../../../@types/rendering/LabelAlignX';
import type { LabelAlignY } from '../../../@types/rendering/LabelAlignY';
import { lookupGlyph } from './fontMetrics';

export function layoutLabel(
  text: string,
  metrics: FontMetrics,
  alignX: LabelAlignX = 'left',
  alignY: LabelAlignY = 'baseline',
): GlyphQuad[] {
  const quads: GlyphQuad[] = [];

  text.split('\n').forEach((line, lineIdx) => {
    const lineY = lineIdx * metrics.lineHeight;
    const lineStart = quads.length;
    let penX = 0;
    let prevCodepoint: number | undefined;

    for (const ch of line) {
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
        localOffsetY: lineY + g.offset.y,
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

    // After the line's layout pass, `penX` holds its total advance width
    // (sum of glyph advances + kerning).  Apply the alignment shift by
    // subtracting a fraction of that width from the LINE's glyphs only.
    // Skipping the loop for the no-op 'left' case keeps the common path
    // allocation-free (no second pass over the quads array).
    if (alignX !== 'left') {
      const shift = alignX === 'center' ? penX * 0.5 : penX;
      for (let i = lineStart; i < quads.length; i++) {
        quads[i]!.localOffsetX -= shift;
      }
    }
  });

  // Vertical alignment: same post-pass shape as alignX, but the
  // reference span is the bounding box of the laid-out glyphs (not
  // a font-default line-box) so labels containing only uppercase /
  // only digits / mixed punctuation each centre on the visible ink.
  //
  // Atlas Y convention: positive localOffsetY puts the glyph BELOW
  // the baseline anchor (the vertex shader negates Y before mixing
  // into world space — see labels/vertex.wesl).  So minY here is the
  // smallest Y (top of the highest glyph) and maxY is the largest
  // (bottom of the lowest glyph).
  if (alignY !== 'baseline' && quads.length > 0) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const q of quads) {
      if (q.localOffsetY < minY) minY = q.localOffsetY;
      const bottom = q.localOffsetY + q.localSizeH;
      if (bottom > maxY) maxY = bottom;
    }
    // shift = where the chosen anchor currently sits in atlas-Y; we
    // subtract it from every glyph so the anchor lands at Y=0.
    //   center  → midpoint of bbox
    //   top     → top of highest glyph
    //   bottom  → bottom of lowest glyph
    const shiftY = alignY === 'center' ? (minY + maxY) * 0.5 : alignY === 'top' ? minY : maxY;
    for (const q of quads) {
      q.localOffsetY -= shiftY;
    }
  }

  return quads;
}
