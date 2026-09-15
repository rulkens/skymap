import type { SurfaceTileBand } from '../../@types/scene/SurfaceTileBand';
import { surfaceTileBandOverlapsUv } from './surfaceTileBandOverlapsUv';
import { surfaceTileColumns } from './surfaceTileColumns';

/**
 * surfaceTileInBand — does a file exist for `(z, x, y)`? A band claims a tile
 * when it overlaps the tile's PARENT box, not the tile's own: that closure is
 * what puts all three siblings of every baked tile on disk (R11), so a node
 * whose children a band bakes never waits on a sibling that will never exist.
 * The bake enumerates from this predicate; the walk gates requests on it.
 */
export function surfaceTileInBand(
  bands: readonly SurfaceTileBand[],
  tilePx: number,
  z: number,
  x: number,
  y: number,
): boolean {
  const cols = surfaceTileColumns(z, tilePx);
  const rows = cols / 2;
  // The parent box on this level's own grid: the sibling pair either side.
  const u0 = (x & ~1) / cols;
  const u1 = ((x | 1) + 1) / cols;
  // Tile rows count south from +90 while band `v` counts north from −90.
  const v0 = 1 - ((y | 1) + 1) / rows;
  const v1 = 1 - (y & ~1) / rows;
  for (const band of bands) {
    if (z >= band.min && z <= band.max && surfaceTileBandOverlapsUv(band, u0, u1, v0, v1)) {
      return true;
    }
  }
  return false;
}
