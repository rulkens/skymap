/**
 * buildAntiqueGlyphSheet — sets the plate's lettering on a canvas, ink in the
 * red channel to match the ornament atlas: the border's digits and degree marks
 * in IM Fell DW Pica, then every plate's cartouche title in IM Fell English, one
 * block per title shaped to the cartouche's interior (both OFL, digitised from
 * the Fell types cut c. 1670). Runs once, when the look first draws.
 */

import type { AntiqueGlyphSheet } from '../../../@types/rendering/AntiqueGlyphSheet';
import type { AntiqueTitleKey } from '../../../@types/rendering/AntiqueTitleKey';
import { ANTIQUE_ORNAMENT_ATLAS } from '../../../data/rendering/antiqueOrnamentAtlas';
import { ANTIQUE_TITLES } from '../../../data/rendering/antiqueTitles';
import { drawAntiqueTitle } from './drawAntiqueTitle';

const DIGITS_FAMILY = 'IM Fell DW Pica';
const TITLE_FAMILY = 'IM Fell English';
const FACES: readonly [string, string, FontFaceDescriptors][] = [
  [DIGITS_FAMILY, '/fonts/antique/IMFellDWPica-Regular.woff2', {}],
  [TITLE_FAMILY, '/fonts/antique/IMFellEnglish-Regular.woff2', {}],
  [TITLE_FAMILY, '/fonts/antique/IMFellEnglish-Italic.woff2', { style: 'italic' }],
];
// Digits, and the marks of degrees and minutes (the face has no prime; its apostrophe serves).
const GLYPHS = '0123456789°’';
const EM = 64;
/** A title block's width: about the cartouche sprite's own interior, so the two print at one scale. */
const TITLE_BLOCK_PX = 384;
const TITLE_COLUMNS = 5;

export async function buildAntiqueGlyphSheet(): Promise<AntiqueGlyphSheet> {
  await Promise.all(
    FACES.map(async ([family, url, descriptors]) => {
      const face = new FontFace(family, `url(${url})`, descriptors);
      await face.load();
      document.fonts.add(face);
    }),
  );
  const pad = Math.ceil(EM * 0.15);
  // One line box for every digit, so a number set from several keeps one baseline.
  const ascent = Math.ceil(EM * 0.8);
  const lineH = Math.ceil(EM * 1.05) + pad * 2;
  const { cartoucheOval: oval, sprites } = ANTIQUE_ORNAMENT_ATLAS;
  const card = sprites.cartouche!;
  const blockH = Math.round((TITLE_BLOCK_PX * oval.ry * card.h) / (oval.rx * card.w));
  const keys = Object.keys(ANTIQUE_TITLES) as AntiqueTitleKey[];
  const canvas = new OffscreenCanvas(
    Math.max(GLYPHS.length * (EM + pad * 2), TITLE_COLUMNS * TITLE_BLOCK_PX),
    lineH + Math.ceil(keys.length / TITLE_COLUMNS) * blockH,
  );
  const g = canvas.getContext('2d');
  if (g === null) throw new Error('antique look: no 2d context for the glyph sheet');
  g.font = `${EM}px "${DIGITS_FAMILY}"`;
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
  const titles = {} as Record<AntiqueTitleKey, { x: number; y: number; w: number; h: number }>;
  keys.forEach((key, i) => {
    const block = {
      x: (i % TITLE_COLUMNS) * TITLE_BLOCK_PX,
      y: lineH + Math.floor(i / TITLE_COLUMNS) * blockH,
      w: TITLE_BLOCK_PX,
      h: blockH,
    };
    drawAntiqueTitle(g, TITLE_FAMILY, ANTIQUE_TITLES[key], block);
    titles[key] = block;
  });
  return {
    bitmap: canvas.transferToImageBitmap(),
    width: canvas.width,
    height: canvas.height,
    baseline: (pad + ascent) / lineH,
    glyphs,
    titles,
  };
}
