#!/usr/bin/env node
/**
 * packOrnaments (`npm run pack-ornaments`) — packs the antique look's engraved
 * ornaments into `public/antique/ornaments.png` and generates its layout module.
 * Channels: R ink density, G fill (the solid silhouette the plate is cleared to
 * paper under), B wash (the alpha of `<id>.colour.png` when a sprite has one,
 * else a flat share of the fill; the cartouche's frame, never its field), A the
 * share of the row's main pigment over its accent (the cartouche's moulding ring).
 * The cartouche's interior is left blank: each plate sets its own title there
 * at runtime (`buildAntiqueGlyphSheet`), so the module records the interior oval.
 * Inputs: data/antique/sprites/<id>.png (black RGB, ink in alpha), optional
 * <id>.colour.png (RGB hue, alpha saturation); provenance in data/antique/PROVENANCE.md.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { smoothstep } from '../../src/utils/math/smoothstep';
import type { GreyRaster } from '../@types/image/GreyRaster';
import { closeMaskDisc } from '../utils/image/closeMaskDisc';
import { dilateMaskDisc } from '../utils/image/dilateMaskDisc';
import { fillMaskHoles } from '../utils/image/fillMaskHoles';
import { gaussianBlurFloat32 } from '../utils/image/gaussianBlurFloat32';
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
const MAX_ATLAS_PX = 2304;
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
/** A sea beast's and a constellation figure's flat wash, as a share of full. */
const FILL_WASH = 0.28;
const FIGURE_WASH = 0.85;
/** The cartouche's moulding ring, out to this scale of its interior: the accent pigment's. */
const RING_SCALE = 1.09;
const FILL_BLUR_SIGMA_PX = 1.5;

/**
 * The cartouche's empty interior, measured on the 591×634 source just inside its
 * inner rule and stored normalised to the unpadded sprite. Hard-coded rather than
 * detected: the interior opens upward between the crest scrolls, so a flood leaks.
 */
const CARTOUCHE_OVAL = { cx: 0.504, cy: 0.502, rx: 0.318, ry: 0.31 } as const;
/** Ink-density band pushed to paper/ink, so scanned greys read as engraved lines. */
const INK_PUSH = [0.3, 0.65] as const;
/**
 * Constellation figures print through the atlas's mip chain (`decor.wesl`), so
 * they keep their source resolution and a gentler push: each hatch line stays a
 * line down to the level the plate reads, instead of a grey the push erased.
 */
const FIGURE_IDS: ReadonlySet<(typeof SPRITE_IDS)[number]> = new Set([
  'cetus',
  'dragon',
  'seaSerpent',
]);
const FIGURE_SIDE_PX = 1024;
const FIGURE_INK_PUSH = [0.1, 0.8] as const;

/**
 * The sprite's ink density, scaled and padded; `push` maps it to two levels at
 * the source's own resolution first: there a grey is a scan midtone, while after
 * the downscale it is mostly a fine hatch line's coverage, which a push would erase.
 */
async function loadInk(
  file: string,
  push: readonly [number, number] | undefined,
  side: number,
): Promise<GreyRaster> {
  const src = await sharp(spritePath(file))
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ink = push
    ? src.data.map((v) => Math.round(smoothstep(push[0], push[1], v / 255) * 255))
    : src.data;
  const { data, info } = await sharp(ink, {
    raw: { width: src.info.width, height: src.info.height, channels: 1 },
  })
    .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
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

/** Erases the interior's specks, so the plate's title is set on clean paper. */
function clearInterior(ink: Uint8Array, w: number, h: number): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (insideOval(x, y, w, h, 0.95)) ink[y * w + x] = 0;
}

async function buildSprite(id: (typeof SPRITE_IDS)[number]): Promise<OrnamentSprite> {
  const figure = FIGURE_IDS.has(id);
  const side = figure ? FIGURE_SIDE_PX : MAX_SIDE_PX;
  const {
    data: ink,
    width: w,
    height: h,
  } = await loadInk(id, figure ? FIGURE_INK_PUSH : INK_PUSH, side);
  if (id === 'cartouche') clearInterior(ink, w, h);
  // The silhouette reads the unpushed ink: faint wave and hatch lines still hold it together.
  const { data: density } = await loadInk(id, undefined, side);
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
  // A colourist laid each wash flat inside the engraved outline: the whole
  // silhouette, the cartouche's frame but never its field, where the title sits on paper.
  const share = FIGURE_IDS.has(id) ? FIGURE_WASH : FILL_WASH;
  const wash =
    id === 'cartouche'
      ? fill.map((v, i) => (insideOval(i % w, Math.floor(i / w), w, h, 1) ? 0 : v))
      : existsSync(spritePath(`${id}.colour`))
        ? (await loadInk(`${id}.colour`, undefined, side)).data
        : fill.map((v) => Math.round(v * share));
  const accent = new Uint8Array(w * h).fill(255);
  if (id === 'cartouche')
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (insideOval(x, y, w, h, RING_SCALE)) accent[y * w + x] = 0;
  const softAccent = gaussianBlurFloat32(Float32Array.from(accent), w, h, FILL_BLUR_SIGMA_PX);
  return { ink, fill, wash, accent: Uint8Array.from(softAccent, Math.round), w, h };
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
  // Alpha is data (the accent share), decoded unpremultiplied (`fetchAntiqueBitmap`).
  const atlas = new Uint8Array(width * height * 4).fill(255);
  sprites.forEach((s, k) => {
    const { x, y } = rects[k]!;
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        const o = ((y + j) * width + x + i) * 4;
        atlas[o] = s.ink[j * s.w + i]!;
        atlas[o + 1] = s.fill[j * s.w + i]!;
        atlas[o + 2] = s.wash[j * s.w + i]!;
        atlas[o + 3] = s.accent[j * s.w + i]!;
      }
  });
  await sharp(atlas, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(`${ROOT}${OUT_PNG}`);

  const rows = SPRITE_IDS.map((id, k) => {
    const { x, y, w, h } = rects[k]!;
    return `    ${id}: { x: ${x}, y: ${y}, w: ${w}, h: ${h} },`;
  });
  // The interior, renormalised from the unpadded source to the padded sprite the plate draws.
  const card = sprites[SPRITE_IDS.indexOf('cartouche')]!;
  const along = (c: number, side: number) => ((PAD_PX + c * (side - 2 * PAD_PX)) / side).toFixed(4);
  const across = (r: number, side: number) => ((r * (side - 2 * PAD_PX)) / side).toFixed(4);
  const { cx, cy, rx, ry } = CARTOUCHE_OVAL;
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
  cartoucheOval: { cx: ${along(cx, card.w)}, cy: ${along(cy, card.h)}, rx: ${across(rx, card.w)}, ry: ${across(ry, card.h)} },
};
`,
  );
  console.log(
    `packOrnaments: ${sprites.length} sprites → ${OUT_PNG} ${width}×${height}, ${OUT_TS}`,
  );
}

await main();
