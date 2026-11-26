/**
 * The bake must write exactly the horizon tiles the runtime requests (`surfaceTileInBand` over the
 * band two levels up): one it skips is fetched and fails for the session, one past the grid's last
 * row is a file nothing reads.
 */
import { describe, expect, it } from 'vitest';

import { surfaceTileBandFromBounds } from '../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileBandFromBounds';
import { surfaceTileInBand } from '../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileInBand';
import type { SurfaceTileManifestBand } from '../../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifestBand';
import { horizonTilesOfBand } from '../../../../../tools/textures/surfaceHorizon/utils/horizonTilesOfBand';

const PREFIX = 'mars-tiles/v2';
const TILE_PX = 512;
const SOURCE = { sourceId: 'test', attribution: 'test', vintage: '2026' };

/** Every tile at levels min…max the predicate claims for `band`, as `z/x/y`. */
function claimed(band: SurfaceTileManifestBand, min: number, max: number): string[] {
  const uvBand = surfaceTileBandFromBounds(band.bounds, min, max);
  const tiles: string[] = [];
  for (let z = min; z <= max; z++) {
    for (let y = 0; y < 2 ** (z - 1); y++) {
      for (let x = 0; x < 2 ** z; x++) {
        if (surfaceTileInBand([uvBand], TILE_PX, z, x, y)) tiles.push(`${z}/${x}/${y}`);
      }
    }
  }
  return tiles.sort();
}

function bakedFrom(band: SurfaceTileManifestBand): string[] {
  const index = claimed(band, band.min, band.max).map((tile) => `${PREFIX}/height/${tile}.webp`);
  return horizonTilesOfBand(index, PREFIX, band, TILE_PX)
    .map(({ z, x, y }) => `${z}/${x}/${y}`)
    .sort();
}

describe('horizonTilesOfBand', () => {
  it('yields the tiles the runtime requests two levels above a regional band', () => {
    const band = {
      bounds: { west: 10.3, east: 12.9, south: 40.2, north: 41.7 },
      min: 6,
      max: 8,
      builtFrom: { height: SOURCE },
    };
    expect(bakedFrom(band)).toEqual(claimed(band, 4, 6));
  });

  it("stays on the grid where the global band's horizon reaches z1, a single row", () => {
    const band = {
      bounds: { west: -180, east: 180, south: -90, north: 90 },
      min: 3,
      max: 3,
      builtFrom: { height: SOURCE },
    };
    expect(bakedFrom(band)).toEqual(['1/0/0', '1/1/0']);
  });
});
