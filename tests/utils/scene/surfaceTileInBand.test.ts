/**
 * surfaceTileInBand — "did the bake write a file for this tile?", the one
 * predicate the bake enumerates from and the walk gates requests on. Its
 * parent-box rule is what makes a baked tile's siblings exist (R11); a
 * regression to an own-box test is invisible until a band edge streams in
 * with a ring of holes around it.
 */
import { describe, it, expect } from 'vitest';

import { surfaceTileInBand } from '../../../src/utils/scene/surfaceTileInBand';
import { EARTH_TILE_PX } from '../../../src/data/bodies/earthTileParams';
import type { SurfaceTileBand } from '../../../src/@types/scene/SurfaceTileBand';

/** A band covering exactly z8 tile (128, 64)'s own box — 256 columns, 128
 *  rows at a 512 px edge — so every "in" answer below is closure, not width. */
const ONE_TILE: SurfaceTileBand = {
  uBounds: [128 / 256, 129 / 256],
  vBounds: [1 - 65 / 128, 1 - 64 / 128],
  min: 8,
  max: 13,
};

const inBand = (z: number, x: number, y: number) =>
  surfaceTileInBand([ONE_TILE], EARTH_TILE_PX, z, x, y);

describe('surfaceTileInBand', () => {
  it('claims all four siblings of a tile the band overlaps, and nothing beyond', () => {
    expect(inBand(8, 128, 64), 'the band tile itself').toBe(true);
    expect(inBand(8, 129, 64), 'east sibling').toBe(true);
    expect(inBand(8, 128, 65), 'south sibling').toBe(true);
    expect(inBand(8, 129, 65), 'diagonal sibling').toBe(true);
    // One further out is a different parent, whose box only touches the band
    // along an edge — the overlap test is open, so it stays out.
    expect(inBand(8, 130, 64), 'the next quad east').toBe(false);
    expect(inBand(8, 127, 64), 'the next quad west').toBe(false);
  });

  it("respects the band's own level range", () => {
    expect(inBand(7, 64, 32)).toBe(false);
    expect(inBand(13, 128 * 32, 64 * 32)).toBe(true);
    expect(inBand(14, 128 * 64, 64 * 64)).toBe(false);
  });

  it('reads an antimeridian-split band pair as covered on both sides', () => {
    const east: SurfaceTileBand = { uBounds: [0.9, 1], vBounds: [0, 1], min: 8, max: 13 };
    const west: SurfaceTileBand = { uBounds: [0, 0.1], vBounds: [0, 1], min: 8, max: 13 };
    const bands = [east, west];
    expect(surfaceTileInBand(bands, EARTH_TILE_PX, 8, 255, 64)).toBe(true);
    expect(surfaceTileInBand(bands, EARTH_TILE_PX, 8, 0, 64)).toBe(true);
    expect(surfaceTileInBand(bands, EARTH_TILE_PX, 8, 128, 64)).toBe(false);
  });
});
