import type { Vec2 } from '../../@types/math/Vec2';
import { earthTileColumns } from './earthTileColumns';

/**
 * earthTileCentreUv — the mesh uv at the centre of tile `[x, y]` of level `z`.
 *
 * The inverse of `earthTileXyForUv`, written as its own formula rather than by
 * inverting that one, so the pair round-trips as a genuine test. See that
 * function's header for the two uv conventions and the `1 - v` flip between
 * them; the same flip appears here as `1 - (y + 0.5) / rows`.
 *
 * The CENTRE rather than a corner because a corner sits exactly on the boundary
 * between two tiles, where `floor` picks one of them by tie-break and any
 * floating-point wobble picks the other. The centre is the one point in a tile
 * that is unambiguously inside it, which is what makes it the safe probe for
 * both testing and for any caller asking "what covers this tile?".
 */
export function earthTileCentreUv(xy: Readonly<Vec2>, z: number, tilePx: number): Vec2 {
  const cols = earthTileColumns(z, tilePx);
  const rows = cols / 2;
  return [(xy[0] + 0.5) / cols, 1 - (xy[1] + 0.5) / rows];
}
