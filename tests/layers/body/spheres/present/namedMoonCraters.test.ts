/**
 * Every crater the look names must find its row in the baked table, or its name
 * prints beside no ring (the review's Aristarchus and Plato); a rebake or a new name
 * that drifts past the match shows here.
 */

import { describe, expect, it } from 'vitest';

import { ANTIQUE_MOON_CRATERS } from '../../../../../src/data/rendering/antiqueMoonCraters.generated';
import { ANTIQUE_MOON_PLACES } from '../../../../../src/data/labels/antiqueMoonPlaces';
import { ANTIQUE_MOON_TABLE_RADIUS_KM } from '../../../../../src/layers/body/spheres/data/antiqueMoonPrint';
import { moonCraterTable } from '../../../../../src/layers/body/spheres/present/moonCraterTable';
import { namedMoonCraters } from '../../../../../src/layers/body/spheres/present/namedMoonCraters';

describe('namedMoonCraters', () => {
  it('finds a table row for every named crater, each its own', () => {
    const table = moonCraterTable(ANTIQUE_MOON_CRATERS, ANTIQUE_MOON_TABLE_RADIUS_KM);
    const named = namedMoonCraters(table, ANTIQUE_MOON_PLACES, ANTIQUE_MOON_TABLE_RADIUS_KM);
    const craters = ANTIQUE_MOON_PLACES.filter((p) => p.kind === 'crater');
    expect(named).toHaveLength(craters.length);
    expect(new Set(named.map((n) => n.index)).size).toBe(named.length);
  });
});
