import type { Vec2 } from '../../@types/math/Vec2';
import { earthTileColumns } from './earthTileColumns';

/**
 * earthTileXyForUv — which tile of level `z` contains the mesh uv `uv`.
 *
 * This function and `earthTileCentreUv` are the ONLY two places the mesh's uv
 * convention meets the tile grid's, and they are written as two independent
 * formulas rather than one expressed through the other, so that round-tripping
 * a tile through both is a real test of both instead of a tautology.
 *
 * ## The two conventions, and where they disagree
 *
 * `cubeSphereMesh` bakes `u = lon / 2π + 0.5` and `v = lat / π + 0.5`, so:
 *
 *   - `u = 0` is exactly longitude -180, which is exactly the west edge of tile
 *     column 0. The two agree, and no prime-meridian offset enters here — the
 *     `TEXTURE_PRIME_MERIDIAN_U` 0.5 is already baked into the mesh's vertex `u`.
 *   - `v = 0` is the SOUTH pole, whereas tile row 0 is the NORTH edge. Every
 *     tiled raster format on earth counts rows southward from +90; the mesh
 *     counts them northward from -90. Hence the `1 - v`.
 *
 * That single flip is the feature's most likely off-by-one, and it is confined
 * to these two functions on purpose. Getting it wrong does not break anything
 * visibly — it samples the wrong latitude band, which on a globe reads as "the
 * texture is subtly off" rather than as an obvious fault, and could survive a
 * whole visual pass unnoticed.
 *
 * ## Longitude wraps, latitude clamps
 *
 * Longitude is periodic, so a `u` at or past 1 wraps to column 0 — the same
 * wrap the fragment's `fract` and the page-table window's `% cols` apply.
 * Latitude is not periodic: `v` outside [0, 1] is off the top or bottom of the
 * world and clamps to the polar row. Treating the two axes identically is the
 * classic plate-carrée bug, so they are handled separately and visibly.
 */
export function earthTileXyForUv(uv: Readonly<Vec2>, z: number, tilePx: number): Vec2 {
  const cols = earthTileColumns(z, tilePx);
  const rows = cols / 2;
  const x = ((Math.floor(uv[0] * cols) % cols) + cols) % cols;
  const y = Math.min(rows - 1, Math.max(0, Math.floor((1 - uv[1]) * rows)));
  return [x, y];
}
