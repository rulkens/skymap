/**
 * geoTiffHeightSource — a `HeightSource` over an arbitrary equirectangular
 * GeoTIFF whose `grid.bounds` are pixel-EDGE registered (spec §4.1: Mars
 * MOLA and every HiRISE DTM): pixel `i`'s centre sits at a "+0.5" shift
 * measured from the grid's own edges, not a hardcoded ±180/±90 extent.
 */

import type { HeightSource } from './HeightSource';
import type { GeoTiffGrid } from './GeoTiffGrid';
import { boundsOverlap } from '../utils/textures/boundsOverlap';
import { clamp } from '../utils/textures/clamp';
import { heightLatticeBounds } from '../utils/textures/heightLatticeBounds';
import { heightLatticeStepDeg } from '../utils/textures/heightLatticeStepDeg';
import { readGeoTiffWindow } from '../utils/textures/readGeoTiffWindow';

/** Cap on one chunked window read, in samples — see `etopoHeightSource`. */
const MAX_WINDOW_SAMPLES = 8_000_000;

/** Float32's practical minimum sits near -3.4e38; several HiRISE DTMs use it
 *  as no-data while others use an exact -32767, so anything this deep reads
 *  as no-data regardless of the declared sentinel — a bilinear stencil must
 *  never average a real post against either. */
const NODATA_FLOOR = -1e30;

/** A post landing exactly on a source pixel (`fx` or `fy` === 0) gives its
 *  off-side neighbour a zero weight — but `0 * NaN` is NaN, so an unrelated
 *  no-data neighbour would poison an otherwise-exact sample. */
function weighted(value: number, weight: number): number {
  return weight === 0 ? 0 : value * weight;
}

export function geoTiffHeightSource(opts: {
  readonly id: string;
  readonly attribution: string;
  readonly provenance: HeightSource['provenance'];
  readonly grid: GeoTiffGrid;
  /** Exact no-data sentinel; any value `<= -1e30` also reads as no-data. */
  readonly nodata: number;
  /** Added to every valid sample — Mars's areoid-to-datum rebase. */
  readonly offsetM: number;
  readonly maxLevel: number;
}): HeightSource {
  const { grid } = opts;
  const dx = (grid.bounds.east - grid.bounds.west) / grid.width;
  const dy = (grid.bounds.north - grid.bounds.south) / grid.height;
  // A global mosaic (MOLA, Viking) needs the antimeridian post to read the
  // raster's column 0 rather than an off-the-end column; a regional DTM box
  // never reaches its own edge from both sides, so this never engages there.
  const spansFullCircle = Math.abs(grid.bounds.east - grid.bounds.west - 360) < 1e-6;
  // A pole post sits half a pixel beyond the first row's centre; clamping to
  // that row is exact (the whole row IS the pole), where NaN would underfill
  // a spike at each pole.
  const spansPoleToPole = Math.abs(grid.bounds.north - grid.bounds.south - 180) < 1e-6;

  const colOf = (lon: number): number => (lon - grid.bounds.west) / dx - 0.5;
  const rowOf = (lat: number): number => (grid.bounds.north - lat) / dy - 0.5;
  const isNoData = (value: number): boolean => value === opts.nodata || value <= NODATA_FLOOR;

  return {
    id: opts.id,
    attribution: opts.attribution,
    maxLevel: opts.maxLevel,
    coverage: [grid.bounds],
    provenance: opts.provenance,

    async readGrid(z, i0, j0, nx, ny) {
      const box = heightLatticeBounds(z, i0, j0, nx, ny);
      if (!boundsOverlap(box, grid.bounds)) return null;

      const step = heightLatticeStepDeg(z);
      const outGrid = new Float32Array(nx * ny).fill(Number.NaN);

      const colFirst = Math.floor(colOf(-180 + i0 * step));
      const colLast = Math.floor(colOf(-180 + (i0 + nx - 1) * step)) + 1;
      const wraps = spansFullCircle && (colFirst < 0 || colLast > grid.width - 1);
      // Both clamped monotonically from `colFirst < colLast`, so `winWidth`
      // is always >= 1 — never a degenerate empty window to guard against.
      const winLeft = wraps ? 0 : clamp(colFirst, 0, grid.width - 1);
      const winWidth = wraps ? grid.width : clamp(colLast, 0, grid.width - 1) - winLeft + 1;

      const rowBudget = clamp(Math.floor(MAX_WINDOW_SAMPLES / winWidth), 2, grid.height);
      const srcRowsPerPost = step / dy;
      const postsPerChunk = Math.max(1, Math.floor((rowBudget - 2) / Math.max(srcRowsPerPost, 1)));

      for (let jjFrom = 0; jjFrom < ny; jjFrom += postsPerChunk) {
        const jjTo = Math.min(ny - 1, jjFrom + postsPerChunk - 1);
        const rowTop = clamp(Math.floor(rowOf(90 - (j0 + jjFrom) * step)), 0, grid.height - 1);
        const rowBottom = clamp(Math.floor(rowOf(90 - (j0 + jjTo) * step)) + 1, 0, grid.height - 1);
        const winRows = rowBottom - rowTop + 1;
        const window = await readGeoTiffWindow(grid.path, winLeft, rowTop, winWidth, winRows);

        // `null`-like: a coordinate genuinely off the raster's edge (not the
        // wrap case) is never clamped onto the nearest real pixel — that
        // would fabricate a post from a neighbour outside the source's
        // actual extent, which is what `outside bounds -> NaN` guards.
        const at = (col: number, row: number): number => {
          const c = wraps ? ((col % grid.width) + grid.width) % grid.width : col;
          const r = spansPoleToPole ? clamp(row, 0, grid.height - 1) : row;
          if (!wraps && (c < winLeft || c > winLeft + winWidth - 1)) return Number.NaN;
          if (r < rowTop || r > rowTop + winRows - 1) return Number.NaN;
          const value = window[(r - rowTop) * winWidth + (c - winLeft)]!;
          return isNoData(value) ? Number.NaN : value + opts.offsetM;
        };

        for (let jj = jjFrom; jj <= jjTo; jj++) {
          const yf = rowOf(90 - (j0 + jj) * step);
          const y0 = Math.floor(yf);
          const fy = yf - y0;
          for (let ii = 0; ii < nx; ii++) {
            const xf = colOf(-180 + (i0 + ii) * step);
            const x0 = Math.floor(xf);
            const fx = xf - x0;
            outGrid[jj * nx + ii] =
              weighted(at(x0, y0), (1 - fx) * (1 - fy)) +
              weighted(at(x0 + 1, y0), fx * (1 - fy)) +
              weighted(at(x0, y0 + 1), (1 - fx) * fy) +
              weighted(at(x0 + 1, y0 + 1), fx * fy);
          }
        }
      }
      return outGrid;
    },

    async boundsInBox(box) {
      if (!boundsOverlap(box, grid.bounds)) return null;
      const clipWest = Math.max(box.west, grid.bounds.west);
      const clipEast = Math.min(box.east, grid.bounds.east);
      const clipNorth = Math.min(box.north, grid.bounds.north);
      const clipSouth = Math.max(box.south, grid.bounds.south);

      const colFrom = clamp(Math.ceil(colOf(clipWest)), 0, grid.width - 1);
      const colTo = clamp(Math.floor(colOf(clipEast)), 0, grid.width - 1);
      const rowFrom = clamp(Math.ceil(rowOf(clipNorth)), 0, grid.height - 1);
      const rowTo = clamp(Math.floor(rowOf(clipSouth)), 0, grid.height - 1);
      if (colTo < colFrom || rowTo < rowFrom) return null;

      const winWidth = colTo - colFrom + 1;
      const rowsPerChunk = clamp(Math.floor(MAX_WINDOW_SAMPLES / winWidth), 1, grid.height);
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let row = rowFrom; row <= rowTo; row += rowsPerChunk) {
        const rows = Math.min(rowsPerChunk, rowTo - row + 1);
        const window = await readGeoTiffWindow(grid.path, colFrom, row, winWidth, rows);
        for (const value of window) {
          if (isNoData(value) || !Number.isFinite(value)) continue;
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
      return min === Number.POSITIVE_INFINITY ? null : [min + opts.offsetM, max + opts.offsetM];
    },
  };
}
