/**
 * A cartouche frame's wash ends under its engraved outline, as a colourist's
 * brush did: a wash mask blurred or grown past the lines lays a fringe of
 * pigment on the plate's paper (owner: "colours that don't belong"). Measured on
 * the packed atlas: of the wash's outer boundary (where it meets the paper round
 * the frame), the share with no printing ink beside it. Before the inset it was ~60%.
 */

import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ANTIQUE_ORNAMENT_ATLAS } from '../../../src/data/rendering/antiqueOrnamentAtlas';
import { dilateMaskDisc } from '../../../tools/utils/image/dilateMaskDisc';
import { labelMaskRegions } from '../../../tools/utils/image/labelMaskRegions';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CARTOUCHES = ['scrollwork', 'strapwork', 'tablet'] as const;
/** decor.wesl's ink ramp starts at 0.2: fainter atlas ink never prints. */
const PRINTS = 0.2 * 255;
const WASHED = 5;
/** The curls' open sides, where the frame's close bridges paper, end a wash without a line. */
const MAX_OFF_INK_SHARE = 0.25;

describe('cartouche frame wash', () => {
  it.each(CARTOUCHES)('%s ends its wash under its outline', async (id) => {
    const { data } = await sharp(`${ROOT}public/antique/ornaments.png`)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const r = ANTIQUE_ORNAMENT_ATLAS.sprites[id]!;
    const n = r.w * r.h;
    const ink = new Uint8Array(n);
    const wash = new Uint8Array(n);
    for (let j = 0; j < r.h; j++)
      for (let i = 0; i < r.w; i++) {
        const o = ((r.y + j) * ANTIQUE_ORNAMENT_ATLAS.width + r.x + i) * 4;
        ink[j * r.w + i] = data[o]! >= PRINTS ? 1 : 0;
        wash[j * r.w + i] = data[o + 2]! > WASHED ? 1 : 0;
      }
    // The paper round the frame: the bare region holding the sprite's corner.
    const { labels } = labelMaskRegions(
      ink.map((v, k) => (v || wash[k] ? 0 : 1)),
      r.w,
      r.h,
    );
    const outer = labels.map((l) => (l === labels[0] ? 1 : 0));
    const besideOuter = dilateMaskDisc(Uint8Array.from(outer), r.w, r.h, 1);
    const besideInk = dilateMaskDisc(ink, r.w, r.h, 1);
    let edge = 0;
    let offInk = 0;
    for (let k = 0; k < n; k++) {
      if (!wash[k] || !besideOuter[k]) continue;
      edge++;
      if (!besideInk[k]) offInk++;
    }
    expect(edge).toBeGreaterThan(500);
    expect(offInk / edge).toBeLessThan(MAX_OFF_INK_SHARE);
  });
});
