import type { TilePostPosition } from '../../textures/TilePostPosition';
import { SURFACE_TILE_PX } from '../../../src/data/bodies/surfaceTileParams';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../../src/data/bodies/texturePrimeMeridianU';
import { degToRad } from '../../../src/utils/math/degToRad';
import { surfaceTileColumns } from '../../../src/utils/surfaceTiles/surfaceTileColumns';
import { surfaceTileXyForUv } from '../../../src/utils/surfaceTiles/surfaceTileXyForUv';

/**
 * tilePostAtLatLon — which level-`z` tile holds a lat/lon, and where in it.
 * Shared so the height bake and any reader agree post for post. The `1 - v` is
 * the landmine: mesh v counts north from the south pole while tile rows count
 * south from +90, and transposing them samples the wrong latitude band — which
 * reads as "subtly off" rather than as an obvious fault.
 */
export function tilePostAtLatLon(latDeg: number, lonDeg: number, z: number): TilePostPosition {
  const u = degToRad(lonDeg) / (2 * Math.PI) + TEXTURE_PRIME_MERIDIAN_U;
  const v = degToRad(latDeg) / Math.PI + 0.5;
  const cols = surfaceTileColumns(z, SURFACE_TILE_PX);
  const rows = cols / 2;
  const [x, y] = surfaceTileXyForUv([u, v], z, SURFACE_TILE_PX);
  return {
    x,
    y,
    colFrac: u * cols - Math.floor(u * cols),
    rowFrac: Math.min(1, Math.max(0, (1 - v) * rows - y)),
  };
}
