/**
 * dhmTerraenHeightSource — a `HeightSource` over the DHM/Terræn 0.4 m DTM
 * (`data/raw/dhmterraen/README.md`): 1 km GeoTIFF tiles named by their
 * SW-corner kilometre indices in EPSG:25832, float32 metres above DVR90. The
 * lattice is in degrees and the tiles in UTM metres, so every post is
 * projected before sampling (`lonLatToUtm32`) rather than warping the tile.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { HeightSource } from './@types/HeightSource';
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

/** How many distinct 1 km EAST columns `coverage`'s bounding box spans, plus a
 *  margin: the cache must hold a whole lattice ROW's tiles at once, or a scan
 *  across it re-decodes each 25 MB GeoTIFF once per row (was a fixed 4). */
function stripTileSpan(coverage: ReadonlyArray<LonLatBounds>): number {
  let eMin = Number.POSITIVE_INFINITY;
  let eMax = Number.NEGATIVE_INFINITY;
  for (const box of coverage) {
    for (const lon of [box.west, box.east]) {
      for (const lat of [box.south, box.north]) {
        const { easting } = lonLatToUtm32(lon, lat);
        eMin = Math.min(eMin, easting);
        eMax = Math.max(eMax, easting);
      }
    }
  }
  return Math.floor(eMax / TILE_M) - Math.floor(eMin / TILE_M) + 1;
}

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
  const cacheLimit = Math.max(4, stripTileSpan(opts.coverage) + 2);

  function tile(northKm: number, eastKm: number): Promise<Float32Array | null> {
    const key = `${northKm}_${eastKm}`;
    const cached = tiles.get(key);
    if (cached !== undefined) return cached;

    const path = join(opts.dir, `DTM_1km_${key}.tif`);
    const pixels = existsSync(path)
      ? readGeoTiffWindow(path, 0, 0, TILE_PX, TILE_PX)
      : Promise.resolve(null);
    if (tiles.size >= cacheLimit) tiles.delete(tiles.keys().next().value!);
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
      // The tiles' own pixels, not a resampled grid: the box's UTM image is a
      // rotated quadrilateral, so this scans each tile's AXIS-ALIGNED
      // intersection with the box's UTM bounding rect — wider than the box,
      // never narrower, which is all a bound (unioned with the children's
      // exact one) is required to be.
      let eMin = Number.POSITIVE_INFINITY;
      let eMax = Number.NEGATIVE_INFINITY;
      let nMin = Number.POSITIVE_INFINITY;
      let nMax = Number.NEGATIVE_INFINITY;
      for (const lon of [box.west, box.east]) {
        for (const lat of [box.south, box.north]) {
          const { easting, northing } = lonLatToUtm32(lon, lat);
          eMin = Math.min(eMin, easting);
          eMax = Math.max(eMax, easting);
          nMin = Math.min(nMin, northing);
          nMax = Math.max(nMax, northing);
        }
      }

      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (
        let northKm = Math.floor(nMin / TILE_M);
        northKm <= Math.floor(nMax / TILE_M);
        northKm++
      ) {
        for (
          let eastKm = Math.floor(eMin / TILE_M);
          eastKm <= Math.floor(eMax / TILE_M);
          eastKm++
        ) {
          const pixels = await tile(northKm, eastKm);
          if (pixels === null) continue;
          const tileEastM = eastKm * TILE_M;
          const tileNorthM = (northKm + 1) * TILE_M;
          const colFrom = Math.max(0, Math.floor((eMin - tileEastM) / PIXEL_M));
          const colTo = Math.min(TILE_PX - 1, Math.ceil((eMax - tileEastM) / PIXEL_M));
          const rowFrom = Math.max(0, Math.floor((tileNorthM - nMax) / PIXEL_M));
          const rowTo = Math.min(TILE_PX - 1, Math.ceil((tileNorthM - nMin) / PIXEL_M));
          for (let row = rowFrom; row <= rowTo; row++) {
            for (let col = colFrom; col <= colTo; col++) {
              const value = pixels[row * TILE_PX + col]!;
              if (value === NODATA || !Number.isFinite(value)) continue;
              if (value < min) min = value;
              if (value > max) max = value;
            }
          }
        }
      }
      return min === Number.POSITIVE_INFINITY ? null : [min, max];
    },
  };
}
