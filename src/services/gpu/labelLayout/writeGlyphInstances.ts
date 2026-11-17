/**
 * writeGlyphInstances — one label's glyph quads as instance records (`GLYPH_INSTANCE_BYTES`,
 * `VsIn` attributes 1–5 in labels/io.wesl) from instance `start`. Returns how many were written;
 * glyphs past `maxGlyphs` are dropped.
 */

import type { GlyphQuad } from '../../../@types/rendering/GlyphQuad';
import { GLYPH_INSTANCE_BYTES } from '../../../data/labels/labelBufferStrides';

export function writeGlyphInstances(
  quads: readonly GlyphQuad[],
  labelIndex: number,
  fontIndex: number,
  out: { readonly glyphF32: Float32Array; readonly glyphU32: Uint32Array },
  start: number,
  maxGlyphs: number,
): number {
  let at = start;
  for (const q of quads) {
    if (at >= maxGlyphs) break;
    const base = at * (GLYPH_INSTANCE_BYTES / 4);
    out.glyphF32[base + 0] = q.localOffsetX;
    out.glyphF32[base + 1] = q.localOffsetY;
    out.glyphF32[base + 2] = q.localSizeW;
    out.glyphF32[base + 3] = q.localSizeH;
    out.glyphF32[base + 4] = q.uvU0;
    out.glyphF32[base + 5] = q.uvV0;
    out.glyphF32[base + 6] = q.uvU1;
    out.glyphF32[base + 7] = q.uvV1;
    // Integers go through the u32 view so their bit patterns stay exact.
    out.glyphU32[base + 8] = labelIndex;
    out.glyphU32[base + 9] = fontIndex;
    at++;
  }
  return at - start;
}
