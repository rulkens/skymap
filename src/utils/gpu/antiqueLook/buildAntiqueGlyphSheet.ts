/**
 * buildAntiqueGlyphSheet — sets the border's digits and degree marks in IM Fell DW Pica (OFL,
 * digitised from the Fell types cut c. 1670) on a canvas, ink in the red
 * channel to match the ornament atlas. Runs once, when the look first draws.
 */

import type { AntiqueGlyphSheet } from '../../../@types/rendering/AntiqueGlyphSheet';

const FAMILY = 'IM Fell DW Pica';
const FONT_URL = '/fonts/antique/IMFellDWPica-Regular.woff2';
// Digits, and the marks of degrees and minutes (the face has no prime; its apostrophe serves).
const GLYPHS = '0123456789°’';
const EM = 64;

export async function buildAntiqueGlyphSheet(): Promise<AntiqueGlyphSheet> {
  const face = new FontFace(FAMILY, `url(${FONT_URL})`);
  await face.load();
  document.fonts.add(face);
  const pad = Math.ceil(EM * 0.15);
  // One line box for every digit, so a number set from several keeps one baseline.
  const ascent = Math.ceil(EM * 0.8);
  const lineH = Math.ceil(EM * 1.05) + pad * 2;
  const canvas = new OffscreenCanvas(GLYPHS.length * (EM + pad * 2), lineH);
  const g = canvas.getContext('2d');
  if (g === null) throw new Error('antique look: no 2d context for the glyph sheet');
  g.font = `${EM}px "${FAMILY}"`;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ff0000';
  const glyphs: Record<string, { x: number; y: number; w: number; h: number }> = {};
  let x = 0;
  for (const ch of GLYPHS) {
    const m = g.measureText(ch);
    const w = Math.ceil(m.width) + pad * 2;
    g.fillText(ch, x + pad, pad + ascent);
    glyphs[ch] = { x, y: 0, w, h: lineH };
    x += w;
  }
  return {
    bitmap: canvas.transferToImageBitmap(),
    width: canvas.width,
    height: canvas.height,
    baseline: (pad + ascent) / lineH,
    glyphs,
  };
}
