#!/usr/bin/env node
/**
 * packOrnaments (`npm run pack-ornaments`) — packs the antique look's engraved
 * ornaments into `public/antique/ornaments.png` and generates its layout module.
 * Channels: R ink density, G fill (the solid silhouette the plate is cleared to
 * paper under), B wash (the alpha of `<id>.colour.png` when a sprite has one;
 * the cartouche's frame).
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
import type { PlacedTitleLine } from './@types/PlacedTitleLine';
import type { TitleGroup } from './@types/TitleGroup';
import type { TitleLine } from './@types/TitleLine';

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
 * The title block, top to bottom: each group's style and the ways its text may
 * break into lines. `cap` is cap height relative to the first group, `tracking`
 * letter-spacing in em. A line too wide for the interior's chord is condensed to
 * `minSqueeze` before the block shrinks, as engravers cut it; of every
 * combination of breaks the packer keeps the one that lets the block grow largest.
 */
const TITLE_GROUPS: readonly TitleGroup[] = [
  {
    style: { file: ROMAN, cap: 1, tracking: 0.14, minSqueeze: 0.85 },
    breaks: [['NOVA ET ACCVRATISSIMA']],
  },
  {
    style: { file: ROMAN, cap: 1.6, tracking: 0, minSqueeze: 0.72 },
    breaks: [['TOTIVS VNIVERSI TABVLA'], ['TOTIVS VNIVERSI', 'TABVLA']],
  },
  {
    style: { file: ITALIC, cap: 0.85, tracking: 0, minSqueeze: 0.85 },
    breaks: [
      ['Amstelodami, ex officina Skymapiana, Anno MDCXC'],
      ['Amstelodami, ex officina Skymapiana,', 'Anno MDCXC'],
    ],
  },
  {
    style: { file: ITALIC, cap: 0.7, tracking: 0, minSqueeze: 0.85 },
    breaks: [
      ['Cum Privilegio Ordinum Hollandiae et Westfrisiae'],
      ['Cum Privilegio Ordinum', 'Hollandiae et Westfrisiae'],
    ],
  },
];
const TITLE_LAYOUTS: readonly (readonly TitleLine[])[] = TITLE_GROUPS.reduce<TitleLine[][]>(
  (layouts, { style, breaks }) =>
    layouts.flatMap((head) =>
      breaks.map((texts) => [...head, ...texts.map((text) => ({ ...style, text }))]),
    ),
  [[]],
);
/** Share of the interior's height the title block may fill, and its leading in first-line caps. */
const TITLE_HEIGHT_FILL = 0.7;
const TITLE_LEADING = 0.5;
/** Fraction of the interior's chord a title line may span: keeps it inside the rule. */
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

/**
 * Lays one title layout out at first-line cap height `c1` px: each line's em
 * size, condensing, and top edge (block centred on the interior). `undefined`
 * when the block is taller than its share or a line will not fit its chord.
 */
function layTitle(
  layout: readonly TitleLine[],
  faces: ReadonlyMap<string, Font>,
  c1: number,
  rx: number,
  ry: number,
): PlacedTitleLine[] | undefined {
  const metrics = layout.map((line) => {
    const face = faces.get(line.file)!;
    const cap = face.getPath('H', 0, 0, 1).getBoundingBox();
    const box = face.getPath(line.text, 0, 0, 1, { letterSpacing: line.tracking }).getBoundingBox();
    const em = (line.cap * c1) / (cap.y2 - cap.y1);
    return { line, em, width: (box.x2 - box.x1) * em, height: (box.y2 - box.y1) * em };
  });
  const gap = TITLE_LEADING * c1;
  const total = metrics.reduce((sum, m) => sum + m.height, 0) + gap * (metrics.length - 1);
  if (total > TITLE_HEIGHT_FILL * 2 * ry) return undefined;
  let top = -total / 2;
  const placed: PlacedTitleLine[] = [];
  for (const m of metrics) {
    const far = Math.max(Math.abs(top), Math.abs(top + m.height)) / ry;
    const chord = 2 * rx * Math.sqrt(Math.max(0, 1 - far * far)) * TITLE_CHORD_FILL;
    const squeeze = Math.min(1, chord / m.width);
    if (squeeze < m.line.minSqueeze) return undefined;
    placed.push({ line: m.line, em: m.em, squeeze, top });
    top += m.height + gap;
  }
  return placed;
}

/** Engraves the largest-fitting title into `ink` inside the interior, erasing specks first. */
async function engraveTitle(ink: Uint8Array, w: number, h: number): Promise<void> {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (insideOval(x, y, w, h, 0.95)) ink[y * w + x] = 0;
  const iw = w - 2 * PAD_PX;
  const ih = h - 2 * PAD_PX;
  const rx = CARTOUCHE_OVAL.rx * iw;
  const ry = CARTOUCHE_OVAL.ry * ih;
  const faces = new Map(
    [ROMAN, ITALIC].map((file) => [
      file,
      parse(new Uint8Array(readFileSync(join(rawDataPath('fonts.dir'), file))).buffer),
    ]),
  );
  let best: { c1: number; lines: PlacedTitleLine[] } | undefined;
  for (const layout of TITLE_LAYOUTS) {
    let lo = 0;
    let hi = ry;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (layTitle(layout, faces, mid, rx, ry)) lo = mid;
      else hi = mid;
    }
    const lines = layTitle(layout, faces, lo, rx, ry);
    if (lines && (!best || lo > best.c1)) best = { c1: lo, lines };
  }
  if (!best) throw new Error('packOrnaments: the title does not fit the cartouche');
  for (const { line, em, squeeze, top } of best.lines) {
    const glyphs = await rasterizeLine(faces.get(line.file)!, line, em, squeeze);
    const x0 = Math.round(PAD_PX + CARTOUCHE_OVAL.cx * iw - glyphs.width / 2);
    const y0 = Math.round(PAD_PX + CARTOUCHE_OVAL.cy * ih + top);
    for (let y = 0; y < glyphs.height; y++)
      for (let x = 0; x < glyphs.width; x++) {
        const i = (y0 + y) * w + x0 + x;
        ink[i] = Math.max(ink[i]!, glyphs.data[y * glyphs.width + x]!);
      }
  }
}

/**
 * One title line as two-level ink (engraved, no grey), `sizePx` the em size,
 * condensed by `squeeze`, cropped to its ink box. Drawn from the font's outlines
 * rather than sharp's `text` input: on macOS that goes through CoreText, which
 * ignores `fontfile` and falls back to sans.
 */
async function rasterizeLine(
  face: Font,
  line: TitleLine,
  sizePx: number,
  squeeze: number,
): Promise<GreyRaster> {
  const path = face.getPath(line.text, 0, 0, sizePx, { letterSpacing: line.tracking });
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
  const wash =
    id === 'cartouche'
      ? frameWash(ink, w, h)
      : existsSync(spritePath(`${id}.colour`))
        ? (await loadInk(`${id}.colour`, false)).data
        : new Uint8Array(w * h);
  return { ink, fill, wash, w, h };
}

/**
 * The cartouche's wash: its strapwork, grown 3 px, and never the field inside,
 * so the colourist's tint sits on the frame and the title's ground stays paper.
 */
function frameWash(ink: Uint8Array, w: number, h: number): Uint8Array {
  const frame = ink.map((v) => (v > INK_THRESHOLD ? 1 : 0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (insideOval(x, y, w, h, 1)) frame[y * w + x] = 0;
  return dilateMaskDisc(frame, w, h, FILL_GROW_PX).map((v) => v * 255);
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
