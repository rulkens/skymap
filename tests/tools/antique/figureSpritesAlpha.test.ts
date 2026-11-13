/**
 * The constellation figures print as ink over the plate's own paper: a figure
 * re-cut from a scan with its paper left in would lay the scan's tone over the
 * sky as a patch. Guards the source sprites and the packed atlas the plate reads.
 */

import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ANTIQUE_ORNAMENT_ATLAS } from '../../../src/data/rendering/antiqueOrnamentAtlas';
import { ANTIQUE_ORNAMENTS } from '../../../src/data/rendering/antiqueOrnaments';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIGURES = ANTIQUE_ORNAMENTS.filter((o) => o.anchor.kind === 'sky' && !o.clearsBeneath).map(
  (o) => o.sprite,
);

describe('constellation figure sprites', () => {
  it('finds the figures', () => {
    expect(FIGURES.length).toBeGreaterThan(0);
  });

  it.each(FIGURES)('%s is black ink with paper fully transparent', async (id) => {
    const { data, info } = await sharp(`${ROOT}data/antique/sprites/${id}.png`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const alpha = (x: number, y: number) => data[(y * w + x) * 4 + 3];
    expect([alpha(0, 0), alpha(w - 1, 0), alpha(0, h - 1), alpha(w - 1, h - 1)]).toEqual([
      0, 0, 0, 0,
    ]);
    let bare = 0;
    let tinted = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) bare++;
      if (data[i]! + data[i + 1]! + data[i + 2]! > 0) tinted++;
    }
    // Hevelius' figures are open line work: most of the box is untouched paper.
    expect(bare / (w * h)).toBeGreaterThan(0.5);
    expect(tinted).toBe(0);
  });

  it.each(FIGURES)('%s has no ink or wash on its packed border', async (id) => {
    const { data } = await sharp(`${ROOT}public/antique/ornaments.png`)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width } = ANTIQUE_ORNAMENT_ATLAS;
    const r = ANTIQUE_ORNAMENT_ATLAS.sprites[id]!;
    for (let j = 0; j < r.h; j++)
      for (let i = 0; i < r.w; i++) {
        if (j > 0 && j < r.h - 1 && i > 0 && i < r.w - 1) continue;
        const o = ((r.y + j) * width + r.x + i) * 4;
        // r ink, b wash (packOrnaments' channels).
        expect([data[o], data[o + 2]]).toEqual([0, 0]);
      }
  });
});
