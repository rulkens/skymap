/**
 * The bake writes a horizon tile only where at least one of its 16 sub-tiles has heights of its
 * own: an all-fallback tile carries nothing its ancestor lacks, so it stays out of the archive and
 * the runtime reads the ancestor for it (`SurfaceTileResidency.isMissing`). A tile the runtime never
 * requests, or one coarser than the globe images' lowest source level, is a file nothing reads.
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

function bakedFrom(band: SurfaceTileManifestBand, heights: readonly string[]): string[] {
  const index = heights.map((tile) => `${PREFIX}/height/${tile}.webp`);
  return horizonTilesOfBand(index, PREFIX, band, TILE_PX)
    .map(({ z, x, y }) => `${z}/${x}/${y}`)
    .sort();
}

/** Whether any of tile `z/x/y`'s 16 descendants two levels down is in `heights`. */
function hasOwnHeights(tile: string, heights: ReadonlySet<string>): boolean {
  const [z, x, y] = tile.split('/').map(Number) as [number, number, number];
  for (let q = 0; q < 16; q++) {
    if (heights.has(`${z + 2}/${4 * x + (q & 3)}/${4 * y + (q >> 2)}`)) return true;
  }
  return false;
}

describe('horizonTilesOfBand', () => {
  it('bakes the requestable tiles two levels above a regional band that have heights of their own', () => {
    const band = {
      bounds: { west: 10.3, east: 12.9, south: 40.2, north: 41.7 },
      min: 6,
      max: 8,
      builtFrom: { height: SOURCE },
    };
    const heights = claimed(band, band.min, band.max);
    const own = new Set(heights);
    const requestable = claimed(band, 4, 6);

    expect(requestable.filter((tile) => !hasOwnHeights(tile, own)).length).toBeGreaterThan(0);
    expect(bakedFrom(band, heights)).toEqual(
      requestable.filter((tile) => hasOwnHeights(tile, own)),
    );
  });

  it("starts the global band's horizon at the small globe image's level, z2", () => {
    const band = {
      bounds: { west: -180, east: 180, south: -90, north: 90 },
      min: 3,
      max: 4,
      builtFrom: { height: SOURCE },
    };
    expect(bakedFrom(band, claimed(band, band.min, band.max))).toEqual(claimed(band, 2, 2));
  });
});
