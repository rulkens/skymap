import type { Vec2 } from '../../@types/math/Vec2';
import { earthTileColumns } from './earthTileColumns';

/**
 * earthTileXyForUv — which tile of level `z` contains the mesh uv `uv`.
 *
 * This function and `earthTileCentreUv` are the ONLY two places the mesh's uv
 * convention meets the tile grid's, written as independent formulas so
 * round-tripping a tile through both is a real test.
 *
 * `cubeSphereMesh` bakes `v = lat / π + 0.5`, so `v = 0` is the SOUTH pole,
 * but tile row 0 is the NORTH edge — every tiled raster format counts rows
 * southward from +90, the mesh northward from -90, hence the `1 - v`. Getting
 * this flip wrong samples the wrong latitude band, which reads as "subtly
 * off" rather than an obvious fault.
 *
 * Longitude is periodic (`u` past 1 wraps to column 0); latitude clamps
 * (`v` outside [0, 1] pins to the polar row).
 */
export function earthTileXyForUv(uv: Readonly<Vec2>, z: number, tilePx: number): Vec2 {
  const cols = earthTileColumns(z, tilePx);
  const rows = cols / 2;
  const x = ((Math.floor(uv[0] * cols) % cols) + cols) % cols;
  const y = Math.min(rows - 1, Math.max(0, Math.floor((1 - uv[1]) * rows)));
  return [x, y];
}
