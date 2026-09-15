/**
 * etopoHeightSource — the global `HeightSource`: ETOPO 2022 30″ surface
 * elevation, one 43200×21600 float32 GeoTIFF with bathymetry included
 * (`data/raw/etopo/README.md`). Cell (AREA) registration, so a pixel's value
 * sits at its CENTRE, half a cell off the corner the geotransform names — the
 * difference between a coastline on the right post and a 460 m shift everywhere.
 */

import sharp from 'sharp';

import type { HeightSource } from './HeightSource';
import { heightLatticeStepDeg } from '../utils/textures/heightLatticeStepDeg';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { readGeoTiffWindow } from '../utils/textures/readGeoTiffWindow';

/** 30″ posts are 926 m; z8's lattice step is 1222 m, the deepest level this
 *  still resolves (spec §4.1's z8.4). */
const ETOPO_MAX_LEVEL = 8;

/** `gdalinfo`'s `NoData Value` for the shipped GeoTIFF. */
const ETOPO_NODATA = -99999;

/** Cap on one window read, in samples: a whole-globe lattice strip at z7 is
 *  43200 source columns wide, so an unchunked read of its 2.8° of latitude
 *  would be hundreds of megabytes. 8M f32 is 32 MB. */
const MAX_WINDOW_SAMPLES = 8_000_000;

const ETOPO_PROVENANCE = {
  sourceId: 'etopo-2022-30s-surface',
  attribution:
    'ETOPO 2022 15 Arc-Second Global Relief Model (30″ surface-elevation ' +
    'product), NOAA National Centers for Environmental Information, ' +
    'DOI 10.25921/fd45-gt74 — public domain.',
  vintage: '2022',
} as const;

const WHOLE_GLOBE = [{ west: -180, east: 180, south: -90, north: 90 }] as const;

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

export async function etopoHeightSource(): Promise<HeightSource> {
  const path = rawDataPath('etopo.surface30s');
  // Grid read off the file, not compiled in: a future 15″ release then needs
  // only a registry edit and a `maxLevel` bump.
  const { width, height } = await sharp(path, { limitInputPixels: false }).metadata();
  if (width === undefined || height === undefined || width !== 2 * height) {
    throw new Error(`etopoHeightSource: ${path} is ${width}x${height}, not a 2:1 equirect grid`);
  }
  const pixelDeg = 360 / width;

  /** Fractional source pixel coordinates of a lon/lat, cell-centred. */
  const colOf = (lon: number): number => (lon + 180) / pixelDeg - 0.5;
  const rowOf = (lat: number): number => (90 - lat) / pixelDeg - 0.5;

  return {
    id: 'etopo-2022-30s',
    attribution: ETOPO_PROVENANCE.attribution,
    maxLevel: ETOPO_MAX_LEVEL,
    coverage: WHOLE_GLOBE,
    provenance: ETOPO_PROVENANCE,

    async readGrid(z, i0, j0, nx, ny) {
      const step = heightLatticeStepDeg(z);
      const grid = new Float32Array(nx * ny);

      const colFirst = Math.floor(colOf(-180 + i0 * step));
      const colLast = Math.floor(colOf(-180 + (i0 + nx - 1) * step)) + 1;
      // A lattice row reaching the antimeridian needs the column on the far
      // side of the seam; reading the full width and indexing modulo is the
      // whole wrap case, and only a near-global strip ever triggers it.
      const wraps = colFirst < 0 || colLast > width - 1;
      const winLeft = wraps ? 0 : colFirst;
      const winWidth = wraps ? width : colLast - colFirst + 1;

      const srcRowsPerPost = step / pixelDeg;
      const rowBudget = clamp(Math.floor(MAX_WINDOW_SAMPLES / winWidth), 2, height);
      const postsPerChunk = Math.max(1, Math.floor((rowBudget - 2) / Math.max(srcRowsPerPost, 1)));

      for (let jjFrom = 0; jjFrom < ny; jjFrom += postsPerChunk) {
        const jjTo = Math.min(ny - 1, jjFrom + postsPerChunk - 1);
        const rowTop = clamp(Math.floor(rowOf(90 - (j0 + jjFrom) * step)), 0, height - 1);
        const rowBottom = clamp(Math.floor(rowOf(90 - (j0 + jjTo) * step)) + 1, 0, height - 1);
        const winRows = rowBottom - rowTop + 1;
        const window = await readGeoTiffWindow(path, winLeft, rowTop, winWidth, winRows);

        const at = (col: number, row: number): number => {
          const c = wraps
            ? ((col % width) + width) % width
            : clamp(col, winLeft, winLeft + winWidth - 1) - winLeft;
          const r = clamp(row, rowTop, rowTop + winRows - 1) - rowTop;
          const value = window[r * winWidth + c]!;
          return value === ETOPO_NODATA ? Number.NaN : value;
        };

        for (let jj = jjFrom; jj <= jjTo; jj++) {
          const yf = rowOf(90 - (j0 + jj) * step);
          const y0 = Math.floor(yf);
          const fy = yf - y0;
          for (let ii = 0; ii < nx; ii++) {
            const xf = colOf(-180 + (i0 + ii) * step);
            const x0 = Math.floor(xf);
            const fx = xf - x0;
            grid[jj * nx + ii] =
              at(x0, y0) * (1 - fx) * (1 - fy) +
              at(x0 + 1, y0) * fx * (1 - fy) +
              at(x0, y0 + 1) * (1 - fx) * fy +
              at(x0 + 1, y0 + 1) * fx * fy;
          }
        }
      }
      return grid;
    },

    async boundsInBox(box) {
      const colFrom = clamp(Math.ceil(colOf(box.west)), 0, width - 1);
      const colTo = clamp(Math.floor(colOf(box.east)), 0, width - 1);
      const rowFrom = clamp(Math.ceil(rowOf(box.north)), 0, height - 1);
      const rowTo = clamp(Math.floor(rowOf(box.south)), 0, height - 1);
      if (colTo < colFrom || rowTo < rowFrom) return null;

      const winWidth = colTo - colFrom + 1;
      const rowsPerChunk = clamp(Math.floor(MAX_WINDOW_SAMPLES / winWidth), 1, height);
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let row = rowFrom; row <= rowTo; row += rowsPerChunk) {
        const rows = Math.min(rowsPerChunk, rowTo - row + 1);
        const window = await readGeoTiffWindow(path, colFrom, row, winWidth, rows);
        for (const value of window) {
          if (value === ETOPO_NODATA || !Number.isFinite(value)) continue;
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
      return min === Number.POSITIVE_INFINITY ? null : [min, max];
    },
  };
}
