/**
 * A famous star's absMag and distancePc must reproduce its catalogue V: the
 * antique star-glyph class and the point renderer both derive apparent
 * magnitude from absMag + distance, so an absMag taken from a different
 * source (or a bolometric/extinction-corrected value) misdraws the star.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFamousStarsSeed } from '../../../tools/parsers/famousStarsSeed';
import { rawDataPath } from '../../../tools/utils/io/rawDataRegistry';
import { STAR_SEEDS } from '../../../tools/famous/buildFamousStars';

describe('famous star seed magnitudes', () => {
  it('derives apparent magnitude within 0.3 mag of the catalogue V', () => {
    const off: string[] = [];
    for (const seed of STAR_SEEDS) {
      const entries = parseFamousStarsSeed(readFileSync(rawDataPath(seed.seedKey), 'utf8'));
      for (const e of entries) {
        if (e.magV == null || e.distancePc <= 0) continue;
        const m = e.absMag + 5 * Math.log10(e.distancePc / 10);
        if (Math.abs(m - e.magV) > 0.3) off.push(`${e.id}: derived ${m.toFixed(2)} vs V ${e.magV}`);
      }
    }
    expect(off).toEqual([]);
  });
});
