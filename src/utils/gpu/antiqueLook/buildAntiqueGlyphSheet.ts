/**
 * buildAntiqueGlyphSheet — sets the plate's lettering on a canvas, ink in the
 * red channel to match the ornament atlas: the border's digits and degree marks
 * in IM Fell DW Pica, then every plate's cartouche title in IM Fell English, one
 * block per title shaped to its cartouche's field, and beside it the title's
 * compact setting for a shrunken cartouche, its name alone (both OFL, digitised from
 * the Fell types cut c. 1670). Runs once, when the look first draws.
 */

import type { AntiqueGlyphSheet } from '../../../@types/rendering/AntiqueGlyphSheet';
import type { AntiqueSheetRect } from '../../../@types/rendering/AntiqueSheetRect';
import type { AntiqueTitleKey } from '../../../@types/rendering/AntiqueTitleKey';
import { ANTIQUE_ORNAMENT_ATLAS } from '../../../data/rendering/antiqueOrnamentAtlas';
import { ANTIQUE_TITLE_CARTOUCHES } from '../../../data/rendering/antiqueTitleCartouches';
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
/** A title block's width: about a cartouche sprite's own field, so the two print at one scale. */
const TITLE_BLOCK_PX = 384;
// Even, so a title's full and compact blocks share a row.
const TITLE_COLUMNS = 6;

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
  const { interiors, sprites } = ANTIQUE_ORNAMENT_ATLAS;
  const keys = (Object.keys(ANTIQUE_TITLES) as AntiqueTitleKey[]).flatMap((key) => [key, key]);
  // Each block takes its frame's field shape; a row of blocks is as tall as its tallest.
  const blockH = keys.map((key) => {
    const design = ANTIQUE_TITLE_CARTOUCHES[key];
    const field = interiors[design]!;
    const card = sprites[design]!;
    return Math.round((TITLE_BLOCK_PX * field.ry * card.h) / (field.rx * card.w));
  });
  const rowTops = [lineH];
  for (let i = 0; i < keys.length; i += TITLE_COLUMNS)
    rowTops.push(rowTops.at(-1)! + Math.max(...blockH.slice(i, i + TITLE_COLUMNS)));
  const canvas = new OffscreenCanvas(
    Math.max(GLYPHS.length * (EM + pad * 2), TITLE_COLUMNS * TITLE_BLOCK_PX),
    rowTops.at(-1)!,
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
  const titles = {} as Record<
    AntiqueTitleKey,
    { full: AntiqueSheetRect; compact: AntiqueSheetRect }
  >;
  keys.forEach((key, i) => {
    const block = {
      x: (i % TITLE_COLUMNS) * TITLE_BLOCK_PX,
      y: rowTops[Math.floor(i / TITLE_COLUMNS)]!,
      w: TITLE_BLOCK_PX,
      h: blockH[i]!,
    };
    // A pocket atlas's small cartouche keeps the name alone (its largest group), set larger.
    const compact = i % 2 === 1;
    const groups = ANTIQUE_TITLES[key];
    const name = groups.reduce((a, b) => (b.style.cap > a.style.cap ? b : a));
    drawAntiqueTitle(g, TITLE_FAMILY, compact ? [name] : groups, block);
    titles[key] = { ...titles[key], [compact ? 'compact' : 'full']: block };
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
