/**
 * EarthTileId — one tile of Earth's virtual surface texture: which map, which
 * pyramid level, which cell.
 *
 * The addressing is geographic (plate carrée, EPSG:4326). Level `z` is the
 * pyramid step whose full equirectangular width is `512 << z` texels, so `z = 4`
 * is exactly today's whole-globe 8192 × 4096 base texture and every step doubles.
 * `x` counts east from longitude -180, `y` counts south from latitude +90 — the
 * north-first row order every tiled raster format uses, which is the OPPOSITE of
 * the mesh's south-first `v` (`cubeSphereMesh.ts`). That reconciliation happens
 * once, in `earthTileXyForUv` / `earthTileCentreUv`, and nowhere else.
 *
 * The grid at level `z` with a `tilePx` tile edge is therefore
 * `(512 << z) / tilePx` columns by half that many rows. With the shipped
 * `tilePx = 512` every tile is the exact 2 × 2 union of four 256 px source
 * tiles, so the bake is a merge and never a resample.
 *
 * Deliberately NOT cube-sphere `(face, level, tileX, tileY)` addressing, even
 * though the mesh carries those parameters: both candidate imagery sources are
 * EPSG:4326 rasters, so a cube-sphere bake would resample every pixel twice, and
 * the fragment holds an equirect uv rather than a face id.
 */

import type { EarthTileKind } from './EarthTileKind';

export type EarthTileId = {
  readonly kind: EarthTileKind;
  readonly z: number;
  readonly x: number;
  readonly y: number;
};
