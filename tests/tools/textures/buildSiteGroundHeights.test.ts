/**
 * buildSiteGroundHeights — the raster sampler and band-selection maths are
 * pure and disk-free (real baked tiles aren't in the repo, only the worktree
 * symlink), so both are pinned against synthetic fixtures rather than a real
 * tile.
 */

import { describe, expect, it } from 'vitest';

import {
  deepestBandLevel,
  sampleTileRasterHeightM,
  type DecodedHeightRaster,
} from '../../../tools/textures/buildSiteGroundHeights';
import { HEIGHT_POSTS_PER_TILE } from '../../../src/data/scene/heightTileFormat';
import { codeHeightM } from '../../../src/utils/surfaceTiles/codeHeightM';
import type { SurfaceTileManifest } from '../../../src/@types/scene/SurfaceTileManifest';

const WIDTH = HEIGHT_POSTS_PER_TILE;
const CHANNELS = 3;

function writeCode(data: Uint8Array, k: number, code: number): void {
  data[k] = (code >> 16) & 0xff;
  data[k + 1] = (code >> 8) & 0xff;
  data[k + 2] = code & 0xff;
}

/** A 129x129 raster where post `(col, row)` carries `codeAt(col, row)`. */
function makeRaster(codeAt: (col: number, row: number) => number): DecodedHeightRaster {
  const data = new Uint8Array(WIDTH * WIDTH * CHANNELS);
  for (let row = 0; row < WIDTH; row++) {
    for (let col = 0; col < WIDTH; col++) {
      writeCode(data, (row * WIDTH + col) * CHANNELS, codeAt(col, row));
    }
  }
  return { data, width: WIDTH, channels: CHANNELS };
}

describe('sampleTileRasterHeightM', () => {
  it('returns the exact decoded height for a uniform raster, at any fraction', () => {
    const CODE = 40_000;
    const raster = makeRaster(() => CODE);
    for (const [colFrac, rowFrac] of [
      [0, 0],
      [0.5, 0.5],
      [0.999, 0.001],
    ] as const) {
      expect(sampleTileRasterHeightM(raster, colFrac, rowFrac)).toBeCloseTo(codeHeightM(CODE), 9);
    }
  });

  it('bilinearly interpolates between adjacent posts along a column gradient', () => {
    // Real bug this catches: a wrong channel stride or a transposed row/col
    // index would read a DIFFERENT pair of posts and land off this exact
    // midpoint — mutation-verified by swapping `col`/`row` in `postM`'s index.
    const CODE_A = 30_000;
    const CODE_B = 40_000;
    const raster = makeRaster((col) => (col === 0 ? CODE_A : CODE_B));
    // Halfway from post 0 to post 1 (128 cells span the whole tile), not
    // halfway across the tile — `colFrac` is tile-relative, not cell-relative.
    const midM = sampleTileRasterHeightM(raster, 0.5 / (WIDTH - 1), 0);
    expect(midM).toBeCloseTo((codeHeightM(CODE_A) + codeHeightM(CODE_B)) / 2, 6);
  });
});

describe('deepestBandLevel', () => {
  const GLOBAL: SurfaceTileManifest['bands'][number] = {
    bounds: { west: -180, east: 180, south: -90, north: 90 },
    min: 3,
    max: 7,
    builtFrom: {},
  };
  const REGIONAL: SurfaceTileManifest['bands'][number] = {
    bounds: { west: 137.36, east: 137.41, south: -4.85, north: -4.8 },
    min: 10,
    max: 17,
    builtFrom: {},
  };
  const MANIFEST: SurfaceTileManifest = {
    prefix: 'mars-tiles/v2',
    tilePx: 512,
    bands: [GLOBAL, REGIONAL],
  };

  it('picks the tighter, deeper band where a regional window nests inside the global one', () => {
    expect(deepestBandLevel(MANIFEST, -4.8246, 137.38848)).toBe(17);
  });

  it('falls back to the global band outside every regional window', () => {
    expect(deepestBandLevel(MANIFEST, 0, 0)).toBe(7);
  });

  it('throws when no band covers the point at all', () => {
    const noGlobal: SurfaceTileManifest = {
      prefix: 'mars-tiles/v2',
      tilePx: 512,
      bands: [REGIONAL],
    };
    expect(() => deepestBandLevel(noGlobal, 0, 0)).toThrow();
  });
});
