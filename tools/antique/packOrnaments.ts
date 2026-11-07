#!/usr/bin/env node
/**
 * packOrnaments (`npm run pack-ornaments`) — packs the antique look's engraved
 * ornaments into `public/antique/ornaments.png` and generates its layout module.
 * Channels: R ink density, G fill (the solid silhouette the plate is cleared to
 * paper under), B wash (the alpha of `<id>.colour.png` when a sprite has one).
 * Inputs: data/antique/sprites/<id>.png (black RGB, ink in alpha), optional
 * <id>.colour.png (RGB hue, alpha saturation), the IM Fell TTFs in the raw
 * fonts dir (shared with the label atlases); provenance in data/antique/PROVENANCE.md.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Font, parse } from 'opentype.js';
import sharp from 'sharp';

import { smoothstep } from '../../src/utils/math/smoothstep';
import type { GreyRaster } from '../@types/image/GreyRaster';
import { closeMaskDisc } from '../utils/image/closeMaskDisc';
import { dilateMaskDisc } from '../utils/image/dilateMaskDisc';
import { fillMaskHoles } from '../utils/image/fillMaskHoles';
import { gaussianBlurFloat32 } from '../utils/image/gaussianBlurFloat32';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { shelfPack } from '../utils/image/shelfPack';
import type { OrnamentSprite } from './@types/OrnamentSprite';

const SPRITE_IDS = [
  'cartouche',
  'cetus',
  'ship',
  'whale',
  'dragon',
  'seaSerpent',
  'seaMonster',
  'seaHorse',
] as const;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT_PNG = 'public/antique/ornaments.png';
const OUT_TS = 'src/data/rendering/antiqueOrnamentAtlas.ts';

const MAX_SIDE_PX = 640;
const MAX_ATLAS_PX = 2048;
const GUTTER_PX = 4;
/** Transparent margin around each sprite: room for the close and the fill halo. */
const PAD_PX = 10;
const INK_THRESHOLD = Math.round(0.08 * 255);
const CLOSE_RADIUS_PX = 6;
/** Wider closes where the engraving leaves a body's outline open (the whale's belly line). */
const CLOSE_RADIUS_OVERRIDE_PX: Partial<Record<(typeof SPRITE_IDS)[number], number>> = {
  whale: 24,
};
const FILL_GROW_PX = 3;
const FILL_BLUR_SIGMA_PX = 1.5;

/**
 * The cartouche's empty interior, measured on the 591×634 source just inside its
 * inner rule and stored normalised to the unpadded sprite. Hard-coded rather than
 * detected: the interior opens upward between the crest scrolls, so a flood leaks.
 */
const CARTOUCHE_OVAL = { cx: 0.504, cy: 0.502, rx: 0.318, ry: 0.31 } as const;
const ROMAN = 'IMFellEnglish-Regular.ttf';
const ITALIC = 'IMFellEnglish-Italic.ttf';
/**
 * `capOfRy` is the cap height as a fraction of the oval's half-height. The oval
 * is too narrow for caps that size at the face's own width, so a line may be
 * condensed down to `minSqueeze` before it shrinks, as engravers cut it.
 */
const TITLE_LINES = [
  { text: 'NOVA ET ACCVRATISSIMA', file: ROMAN, dy: -0.5, capOfRy: 0.19, minSqueeze: 0.72 },
  { text: 'TOTIVS VNIVERSI TABVLA', file: ROMAN, dy: 0.02, capOfRy: 0.26, minSqueeze: 0.72 },
  {
    text: 'Amstelodami, ex officina Skymapiana, Anno MDCXC',
    file: ITALIC,
    dy: 0.5,
    capOfRy: 0.15,
    minSqueeze: 0.8,
  },
] as const;
/** Fraction of the oval's chord a title line may span: keeps it inside the rule. */
const TITLE_CHORD_FILL = 0.92;
/** Ink-density band pushed to paper/ink, so scanned greys read as engraved lines. */
const INK_PUSH = [0.3, 0.65] as const;

/**
 * The sprite's ink density, scaled and padded; `push` maps it to two levels at
 * the source's own resolution first: there a grey is a scan midtone, while after
 * the downscale it is mostly a fine hatch line's coverage, which a push would erase.
 */
async function loadInk(file: string, push: boolean): Promise<GreyRaster> {
  const src = await sharp(spritePath(file))
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ink = push
    ? src.data.map((v) => Math.round(smoothstep(INK_PUSH[0], INK_PUSH[1], v / 255) * 255))
    : src.data;
  const { data, info } = await sharp(ink, {
    raw: { width: src.info.width, height: src.info.height, channels: 1 },
  })
    .resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: 'inside', withoutEnlargement: true })
    .extend({ top: PAD_PX, bottom: PAD_PX, left: PAD_PX, right: PAD_PX, background: '#000' })
    .extractChannel(0) // extend's colour background promotes the plane to sRGB
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

function spritePath(file: string): string {
  return `${ROOT}data/antique/sprites/${file}.png`;
}

function insideOval(x: number, y: number, w: number, h: number, scale: number): boolean {
  const { cx, cy, rx, ry } = CARTOUCHE_OVAL;
  const iw = w - 2 * PAD_PX;
  const ih = h - 2 * PAD_PX;
  const u = (x - PAD_PX - cx * iw) / (rx * iw * scale);
  const v = (y - PAD_PX - cy * ih) / (ry * ih * scale);
  return u * u + v * v <= 1;
}

/** Engraves the title into `ink` inside the oval, erasing the source's specks first. */
async function engraveTitle(ink: Uint8Array, w: number, h: number): Promise<void> {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (insideOval(x, y, w, h, 0.95)) ink[y * w + x] = 0;
  const iw = w - 2 * PAD_PX;
  const ih = h - 2 * PAD_PX;
  const rx = CARTOUCHE_OVAL.rx * iw;
  const ry = CARTOUCHE_OVAL.ry * ih;
  for (const line of TITLE_LINES) {
    const face = parse(
      new Uint8Array(readFileSync(join(rawDataPath('fonts.dir'), line.file))).buffer,
    );
    const chord = 2 * rx * Math.sqrt(1 - line.dy * line.dy) * TITLE_CHORD_FILL;
    const cap = face.getPath('H', 0, 0, 1).getBoundingBox();
    const { x1, x2 } = face.getPath(line.text, 0, 0, 1).getBoundingBox();
    let sizePx = (line.capOfRy * ry) / (cap.y2 - cap.y1);
    let squeeze = Math.min(1, chord / ((x2 - x1) * sizePx));
    if (squeeze < line.minSqueeze) {
      squeeze = line.minSqueeze;
      sizePx = chord / ((x2 - x1) * squeeze);
    }
    const glyphs = await rasterizeLine(face, line.text, sizePx, squeeze);
    const x0 = Math.round(PAD_PX + CARTOUCHE_OVAL.cx * iw - glyphs.width / 2);
    const y0 = Math.round(PAD_PX + CARTOUCHE_OVAL.cy * ih + line.dy * ry - glyphs.height / 2);
    for (let y = 0; y < glyphs.height; y++)
      for (let x = 0; x < glyphs.width; x++) {
        const i = (y0 + y) * w + x0 + x;
        ink[i] = Math.max(ink[i]!, glyphs.data[y * glyphs.width + x]!);
      }
  }
}

/**
 * One line of text as two-level ink (engraved, no grey), `sizePx` the em size,
 * condensed by `squeeze`, cropped to its ink box. Drawn from the font's outlines
 * rather than sharp's `text` input: on macOS that goes through CoreText, which
 * ignores `fontfile` and falls back to sans.
 */
async function rasterizeLine(
  face: Font,
  text: string,
  sizePx: number,
  squeeze: number,
): Promise<GreyRaster> {
  const path = face.getPath(text, 0, 0, sizePx);
  const { x1, y1, x2, y2 } = path.getBoundingBox();
  const width = Math.ceil((x2 - x1) * squeeze);
  const height = Math.ceil(y2 - y1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path transform="scale(${squeeze} 1) translate(${-x1} ${-y1})" d="${path.toPathData(3)}"/></svg>`;
  const { data } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: Uint8Array.from(data, (v) => (v >= 110 ? 255 : 0)), width, height };
}

async function buildSprite(id: (typeof SPRITE_IDS)[number]): Promise<OrnamentSprite> {
  const { data: ink, width: w, height: h } = await loadInk(id, true);
  if (id === 'cartouche') await engraveTitle(ink, w, h);
  // The silhouette reads the unpushed ink: faint wave and hatch lines still hold it together.
  const { data: density } = await loadInk(id, false);
  const solid = fillMaskHoles(
    closeMaskDisc(
      density.map((v) => (v > INK_THRESHOLD ? 1 : 0)),
      w,
      h,
      CLOSE_RADIUS_OVERRIDE_PX[id] ?? CLOSE_RADIUS_PX,
    ),
    w,
    h,
  );
  if (id === 'cartouche')
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (insideOval(x, y, w, h, 1)) solid[y * w + x] = 1;
  const grown = dilateMaskDisc(solid, w, h, FILL_GROW_PX);
  const soft = gaussianBlurFloat32(Float32Array.from(grown), w, h, FILL_BLUR_SIGMA_PX);
  const fill = Uint8Array.from(soft, (v) => Math.round(Math.min(1, v) * 255));
  const wash = existsSync(spritePath(`${id}.colour`))
    ? (await loadInk(`${id}.colour`, false)).data
    : new Uint8Array(w * h);
  return { ink, fill, wash, w, h };
}

/** The narrowest-square packing under the size cap. */
function packSquarest(sprites: readonly OrnamentSprite[]): ReturnType<typeof shelfPack> {
  let best: ReturnType<typeof shelfPack> | undefined;
  for (let maxWidth = 512; maxWidth <= MAX_ATLAS_PX; maxWidth += 16) {
    if (sprites.some((s) => s.w + 2 * GUTTER_PX > maxWidth)) continue;
    const p = shelfPack(sprites, maxWidth, GUTTER_PX);
    if (p.height > MAX_ATLAS_PX) continue;
    const side = Math.max(p.width, p.height);
    if (!best || side < Math.max(best.width, best.height)) best = p;
  }
  if (!best) throw new Error(`packOrnaments: sprites do not fit ${MAX_ATLAS_PX} px`);
  return best;
}

async function main(): Promise<void> {
  const sprites = await Promise.all(SPRITE_IDS.map(buildSprite));
  const { width, height, rects } = packSquarest(sprites);
  // RGB only: a PNG without alpha decodes to A = 1, which is the sheet's contract.
  const atlas = new Uint8Array(width * height * 3);
  sprites.forEach((s, k) => {
    const { x, y } = rects[k]!;
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        const o = ((y + j) * width + x + i) * 3;
        atlas[o] = s.ink[j * s.w + i]!;
        atlas[o + 1] = s.fill[j * s.w + i]!;
        atlas[o + 2] = s.wash[j * s.w + i]!;
      }
  });
  await sharp(atlas, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(`${ROOT}${OUT_PNG}`);

  const rows = SPRITE_IDS.map((id, k) => {
    const { x, y, w, h } = rects[k]!;
    return `    ${id}: { x: ${x}, y: ${y}, w: ${w}, h: ${h} },`;
  });
  writeFileSync(
    `${ROOT}${OUT_TS}`,
    `/**
 * ANTIQUE_ORNAMENT_ATLAS — the packed ornament sheet's layout. GENERATED by
 * \`tools/antique/packOrnaments.ts\` with \`public/antique/ornaments.png\`; do not
 * edit by hand.
 */

import type { AntiqueOrnamentAtlas } from '../../@types/rendering/AntiqueOrnamentAtlas';

export const ANTIQUE_ORNAMENT_ATLAS: AntiqueOrnamentAtlas = {
  width: ${width},
  height: ${height},
  sprites: {
${rows.join('\n')}
  },
};
`,
  );
  console.log(
    `packOrnaments: ${sprites.length} sprites → ${OUT_PNG} ${width}×${height}, ${OUT_TS}`,
  );
}

await main();
