import type { Vec2 } from '../../@types/math/Vec2';
import { earthTileColumns } from './earthTileColumns';

/**
 * earthTileCentreUv — the mesh uv at the centre of tile `[x, y]` of level `z`.
 * The inverse of `earthTileXyForUv`, written as its own formula so the pair
 * round-trips as a genuine test (see that function for the `1 - v` flip).
 *
 * The CENTRE rather than a corner: a corner sits on the boundary between two
 * tiles, where `floor` picks one by tie-break and float wobble can pick the
 * other; the centre is unambiguously inside its tile.
 */
export function earthTileCentreUv(xy: Readonly<Vec2>, z: number, tilePx: number): Vec2 {
  const cols = earthTileColumns(z, tilePx);
  const rows = cols / 2;
  return [(xy[0] + 0.5) / cols, 1 - (xy[1] + 0.5) / rows];
}
