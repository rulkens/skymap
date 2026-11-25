import { HORIZON_POSTS_PER_TILE } from '../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import type { HorizonTile } from '../@types/HorizonTile';

const TILE_SIDE = 2 * HORIZON_POSTS_PER_TILE;
// A tile's last post row and column are its neighbour's first (shared edge), so a tile
// contributes 32 posts per axis, 64 texels.
const TILE_TEXELS = 2 * (HORIZON_POSTS_PER_TILE - 1);

/**
 * repackGlobeHorizon — a whole level of horizon tiles as one equirect image: post (i, j) of
 * tile (x, y) lands at texel block (32x + i, 32y + j), so the image is 2^level · 64 texels
 * wide and half as tall (1024 × 512 at z4: the file is half its tier's nominal width, spec §7).
 * A flat or missing tile stays zero, byte 0 everywhere: fully lit, as the sentinel reads.
 */
export function repackGlobeHorizon(
  tiles: (z: number, x: number, y: number) => HorizonTile | null,
  level: number,
): { readonly width: number; readonly height: number; readonly rgba: Uint8Array } {
  const columns = 2 ** level;
  const width = columns * TILE_TEXELS;
  const height = (columns / 2) * TILE_TEXELS;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < columns / 2; y++) {
    for (let x = 0; x < columns; x++) {
      const tile = tiles(level, x, y);
      if (tile === null || tile.kind === 'flat') continue;
      for (let row = 0; row < TILE_TEXELS; row++) {
        const from = row * TILE_SIDE * 4;
        const to = ((y * TILE_TEXELS + row) * width + x * TILE_TEXELS) * 4;
        rgba.set(tile.rgba.subarray(from, from + TILE_TEXELS * 4), to);
      }
    }
  }
  return { width, height, rgba };
}
