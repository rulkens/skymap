/**
 * SurfaceTileId — one tile of a body's virtual surface texture: which
 * product, pyramid level, and cell (geographic, plate carrée / EPSG:4326).
 * Level `z`'s equirectangular width is `512 << z` texels (`z = 4` is today's
 * 8192x4096 base). `x` counts east from -180, `y` counts south from +90 —
 * opposite the mesh's south-first `v`; reconciled once in
 * `surfaceTileXyForUv` / `surfaceTileCentreUv`. Deliberately NOT cube-sphere:
 * both imagery sources are EPSG:4326 rasters, so that would resample every
 * pixel twice.
 */

import type { SurfaceTileProduct } from './SurfaceTileProduct';

export type SurfaceTileId = {
  readonly product: SurfaceTileProduct;
  readonly z: number;
  readonly x: number;
  readonly y: number;
};
