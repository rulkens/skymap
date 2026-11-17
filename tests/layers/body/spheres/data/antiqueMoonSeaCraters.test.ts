/**
 * A sea crater's blanket is keyed by its place id and found through the named rows: a
 * renamed place or a crater the table lacks would silently put Copernicus back on paper.
 */
import { describe, expect, it } from 'vitest';

import { ANTIQUE_MOON_CRATERS } from '../../../../../src/data/rendering/antiqueMoonCraters.generated';
import { ANTIQUE_MOON_PLACES } from '../../../../../src/data/labels/antiqueMoonPlaces';
import { ANTIQUE_MOON_SEA_CRATERS } from '../../../../../src/layers/body/spheres/data/antiqueMoonSeaCraters';
import { ANTIQUE_MOON_TABLE_RADIUS_KM } from '../../../../../src/layers/body/spheres/data/antiqueMoonPrint';
import { moonCraterTable } from '../../../../../src/layers/body/spheres/present/moonCraterTable';
import { namedMoonCraters } from '../../../../../src/layers/body/spheres/present/namedMoonCraters';

describe('ANTIQUE_MOON_SEA_CRATERS', () => {
  it('names craters the pass rings', () => {
    const table = moonCraterTable(ANTIQUE_MOON_CRATERS, ANTIQUE_MOON_TABLE_RADIUS_KM);
    const named = new Set(
      namedMoonCraters(table, ANTIQUE_MOON_PLACES, ANTIQUE_MOON_TABLE_RADIUS_KM).map((n) => n.id),
    );
    for (const id of ANTIQUE_MOON_SEA_CRATERS) expect(named.has(id), id).toBe(true);
  });
});
