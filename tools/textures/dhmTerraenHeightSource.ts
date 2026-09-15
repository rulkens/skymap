/**
 * dhmTerraenHeightSource — a `HeightSource` over the DHM/Terræn 0.4 m DTM
 * (`data/raw/dhmterraen/README.md`): 1 km GeoTIFF tiles named by their
 * SW-corner kilometre indices in EPSG:25832, float32 metres above DVR90.
 *
 * The one non-obvious step is the projection: the lattice is in degrees and
 * the tiles are in UTM metres, so every post is projected before it is
 * sampled (`lonLatToUtm32`) rather than the tile being warped once. Heights
 * pass through unchanged — DVR90 is orthometric, which R10 takes as
 * sphere-relative for Earth.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { HeightSource } from './HeightSource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import { boundsOverlap } from '../utils/textures/boundsOverlap';
import { heightLatticeBounds } from '../utils/textures/heightLatticeBounds';
import { heightLatticeStepDeg } from '../utils/textures/heightLatticeStepDeg';
import { lonLatToUtm32 } from '../utils/geo/lonLatToUtm32';
import { readGeoTiffWindow } from '../utils/textures/readGeoTiffWindow';

const TILE_M = 1000;
const PIXEL_M = 0.4;
const TILE_PX = TILE_M / PIXEL_M;
const NODATA = -9999;

/** 0.4 m posts; z19's lattice step is 0.597 m (spec §4.1's z19.6). */
const DHM_MAX_LEVEL = 19;

/** Northing of the global pixel grid's row 0 — any tile-aligned value north
 *  of Denmark; it exists only so a post's row index stays non-negative. */
const NORTHING_REF_M = 10_000_000;

/** 2500² f32 is 25 MB a tile, and a lattice strip at z19 spans at most a few. */
const TILE_CACHE_LIMIT = 4;

const DHM_PROVENANCE = {
  sourceId: 'dhm-terraen-04m',
  attribution:
    'Danmarks Højdemodel — Terræn (DHM/Terræn) 0.4 m DTM, ' +
    '© Klimadatastyrelsen, distributed via Datafordeler as free public data.',
  vintage: 'DHM/Terræn 0.4 m, fetched 2026-09-15',
} as const;

export function dhmTerraenHeightSource(opts: {
  readonly dir: string;
  readonly coverage: ReadonlyArray<LonLatBounds>;
}): HeightSource {
  // The PROMISE is cached, not its result: the four corners of one bilinear
  // are awaited together, so caching after the read would let the same 25 MB
  // tile be decoded four times over.
  const tiles = new Map<string, Promise<Float32Array | null>>();

  function tile(northKm: number, eastKm: number): Promise<Float32Array | null> {
    const key = `${northKm}_${eastKm}`;
    const cached = tiles.get(key);
    if (cached !== undefined) return cached;

    const path = join(opts.dir, `DTM_1km_${key}.tif`);
    const pixels = existsSync(path)
      ? readGeoTiffWindow(path, 0, 0, TILE_PX, TILE_PX)
      : Promise.resolve(null);
    if (tiles.size >= TILE_CACHE_LIMIT) tiles.delete(tiles.keys().next().value!);
    tiles.set(key, pixels);
    return pixels;
  }

  /** One native pixel by GLOBAL pixel index, resolving its tile per call so a
   *  bilinear straddling a tile edge reads each side from its own file. */
  async function pixel(px: number, py: number): Promise<number> {
    const tx = Math.floor(px / TILE_PX);
    const ty = Math.floor(py / TILE_PX);
    const pixels = await tile(NORTHING_REF_M / TILE_M - 1 - ty, tx);
    if (pixels === null) return Number.NaN;
    const value = pixels[(py - ty * TILE_PX) * TILE_PX + (px - tx * TILE_PX)]!;
    return value === NODATA || !Number.isFinite(value) ? Number.NaN : value;
  }

  async function sample(lon: number, lat: number): Promise<number> {
    const { easting, northing } = lonLatToUtm32(lon, lat);
    // Cell-centred: pixel (0,0) of a tile is half a pixel inside its NW corner.
    const gx = easting / PIXEL_M - 0.5;
    const gy = (NORTHING_REF_M - northing) / PIXEL_M - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;

    const [a, b, c, d] = await Promise.all([
      pixel(x0, y0),
      pixel(x0 + 1, y0),
      pixel(x0, y0 + 1),
      pixel(x0 + 1, y0 + 1),
    ]);
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }

  return {
    id: 'dhm-terraen-04m',
    attribution: DHM_PROVENANCE.attribution,
    maxLevel: DHM_MAX_LEVEL,
    coverage: opts.coverage,
    provenance: DHM_PROVENANCE,

    async readGrid(z, i0, j0, nx, ny) {
      const box = heightLatticeBounds(z, i0, j0, nx, ny);
      if (!opts.coverage.some((c) => boundsOverlap(c, box))) return null;

      const step = heightLatticeStepDeg(z);
      const grid = new Float32Array(nx * ny);
      for (let jj = 0; jj < ny; jj++) {
        const lat = 90 - (j0 + jj) * step;
        for (let ii = 0; ii < nx; ii++) {
          grid[jj * nx + ii] = await sample(-180 + (i0 + ii) * step, lat);
        }
      }
      return grid;
    },

    async boundsInBox(box) {
      // Sampled on a lon/lat grid rather than the tiles' pixel rect: the box's
      // UTM image is a slightly rotated quadrilateral, so no exact pixel rect
      // exists. The sample count is capped because this is a SUPPLEMENT — the
      // bake unions it with the children's own bounds, which are exact at the
      // deepest level where the lattice is finer than the source.
      const steps = Math.max(2, Math.ceil(((box.east - box.west) * 111320) / PIXEL_M));
      const capped = Math.min(steps, 256);
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let j = 0; j <= capped; j++) {
        const lat = box.south + ((box.north - box.south) * j) / capped;
        for (let i = 0; i <= capped; i++) {
          const value = await sample(box.west + ((box.east - box.west) * i) / capped, lat);
          if (!Number.isFinite(value)) continue;
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
      return min === Number.POSITIVE_INFINITY ? null : [min, max];
    },
  };
}
