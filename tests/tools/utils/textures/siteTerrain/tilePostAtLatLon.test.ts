/**
 * Level 4 is 16 columns x 8 rows, so every expectation below is a whole tile
 * index rather than a rounded fraction. The latitude cases are the point: tile
 * rows count SOUTH from +90 while mesh v counts north, and a transposed flip
 * still lands in range — it just samples the wrong hemisphere.
 */

import { describe, expect, it } from 'vitest';

import { tilePostAtLatLon } from '../../../../../tools/utils/textures/siteTerrain/tilePostAtLatLon';

const Z = 4;

describe('tilePostAtLatLon', () => {
  it('puts the prime meridian at the middle column', () => {
    const { x, colFrac } = tilePostAtLatLon(0, 0, Z);
    expect(x).toBe(8);
    expect(colFrac).toBeCloseTo(0, 12);
  });

  it('puts the equator on the middle row', () => {
    const { y, rowFrac } = tilePostAtLatLon(0, 0, Z);
    expect(y).toBe(4);
    expect(rowFrac).toBeCloseTo(0, 12);
  });

  it('counts rows southward — north of the equator is a LOWER row', () => {
    expect(tilePostAtLatLon(45, 0, Z).y).toBe(2);
    expect(tilePostAtLatLon(-45, 0, Z).y).toBe(6);
  });

  it('counts columns eastward', () => {
    expect(tilePostAtLatLon(0, 90, Z).x).toBe(12);
    expect(tilePostAtLatLon(0, -90, Z).x).toBe(4);
  });

  it('wraps longitude past the antimeridian instead of running off the grid', () => {
    expect(tilePostAtLatLon(0, 270, Z).x).toBe(tilePostAtLatLon(0, -90, Z).x);
  });

  it('keeps the post fractions inside the tile', () => {
    for (const lat of [-89.9, -30, 0, 30, 89.9]) {
      for (const lon of [-179.9, -37.5, 0, 137.4, 354.6]) {
        const { colFrac, rowFrac } = tilePostAtLatLon(lat, lon, Z);
        expect(colFrac).toBeGreaterThanOrEqual(0);
        expect(colFrac).toBeLessThan(1);
        expect(rowFrac).toBeGreaterThanOrEqual(0);
        expect(rowFrac).toBeLessThanOrEqual(1);
      }
    }
  });
});
