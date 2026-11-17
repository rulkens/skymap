import { SURFACE_TILE_ARCHIVE_MAX_LEVEL } from '../data/surfaceTileArchiveFormat';

/**
 * surfaceTileMortonKey — bit 2i is x bit i, bit 2i+1 is y bit i. Keys pass 32
 * bits, so this uses arithmetic: `<<` would truncate to int32.
 */
export function surfaceTileMortonKey(x: number, y: number): number {
  const limit = 2 ** SURFACE_TILE_ARCHIVE_MAX_LEVEL;
  if (x >= limit || y >= limit) throw new Error(`tile (${x}, ${y}) exceeds the 6 B archive key`);
  let key = 0;
  for (let i = 0; i < SURFACE_TILE_ARCHIVE_MAX_LEVEL; i++) {
    key += (Math.floor(x / 2 ** i) % 2) * 2 ** (2 * i);
    key += (Math.floor(y / 2 ** i) % 2) * 2 ** (2 * i + 1);
  }
  return key;
}
