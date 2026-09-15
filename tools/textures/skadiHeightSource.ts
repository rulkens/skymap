/**
 * skadiHeightSource — a `HeightSource` over the `skadi` 1″ harvest
 * (`data/raw/skadi/README.md`): SRTM-format `<N55>/<N55E012>.hgt`, 3601²
 * big-endian int16 metres, GEOGRAPHIC (the sibling terrarium PNGs are
 * WebMercator). Cells overlap by one post per shared edge; `floor` decides
 * which file answers, the same rule `skadiCellsForBounds` fetches by.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { HeightSource } from './HeightSource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import { boundsOverlap } from '../utils/textures/boundsOverlap';
import { heightLatticeBounds } from '../utils/textures/heightLatticeBounds';
import { heightLatticeStepDeg } from '../utils/textures/heightLatticeStepDeg';

/** Posts per cell edge and the 1″ spacing they imply. */
const POSTS = 3601;
const INTERVALS = POSTS - 1;
const VOID = -32768;

/** 1″ ≈ 30 m; z13's lattice step is 1.24″, the deepest level this still
 *  resolves (spec §4.1's z13.3). */
const SKADI_MAX_LEVEL = 13;

const SKADI_PROVENANCE = {
  sourceId: 'skadi-srtm-1arcsec',
  attribution:
    'Elevation from the `skadi` product of the AWS Open Data ' +
    '`elevation-tiles-prod` bucket (Mapzen/Tilezen terrain tiles), built from ' +
    'NASA SRTM v3, USGS NED/3DEP, Canada CDEM and other public-domain national ' +
    'sources — see data/raw/skadi/README.md.',
  vintage: 'SRTM v3 (2000) and national fills',
} as const;

/** Cells are 25.9 MB each; the bake sweeps a band in lattice-row strips, so
 *  only the few cells under the current strip are ever live. */
const CELL_CACHE_LIMIT = 8;

function cellPath(dir: string, latDeg: number, lonDeg: number): string {
  const ns = `${latDeg < 0 ? 'S' : 'N'}${String(Math.abs(latDeg)).padStart(2, '0')}`;
  const ew = `${lonDeg < 0 ? 'W' : 'E'}${String(Math.abs(lonDeg)).padStart(3, '0')}`;
  return join(dir, ns, `${ns}${ew}.hgt`);
}

export function skadiHeightSource(opts: {
  readonly dir: string;
  readonly coverage: ReadonlyArray<LonLatBounds>;
}): HeightSource {
  const cells = new Map<string, Int16Array | null>();

  function cell(latDeg: number, lonDeg: number): Int16Array | null {
    const key = `${latDeg},${lonDeg}`;
    const cached = cells.get(key);
    if (cached !== undefined) return cached;

    const path = cellPath(opts.dir, latDeg, lonDeg);
    let posts: Int16Array | null = null;
    if (existsSync(path)) {
      const buf = readFileSync(path);
      if (buf.byteLength !== POSTS * POSTS * 2) {
        throw new Error(
          `skadiHeightSource: ${path} is ${buf.byteLength} B, expected ${POSTS * POSTS * 2} — truncated download`,
        );
      }
      posts = new Int16Array(POSTS * POSTS);
      for (let k = 0; k < posts.length; k++) posts[k] = buf.readInt16BE(k * 2);
    }
    if (cells.size >= CELL_CACHE_LIMIT) cells.delete(cells.keys().next().value!);
    cells.set(key, posts);
    return posts;
  }

  /** One native post by whole-degree cell and index inside it; NaN for a void
   *  or an absent cell. `latDeg`/`lonDeg` name the cell, `row`/`col` index it
   *  north-first and west-first. */
  function post(latDeg: number, lonDeg: number, row: number, col: number): number {
    const posts = cell(latDeg, lonDeg);
    if (posts === null) return Number.NaN;
    const value = posts[row * POSTS + col]!;
    return value === VOID ? Number.NaN : value;
  }

  /** Bilinear between the four native posts around `(lon, lat)`. The cell and
   *  the index inside it are resolved per CORNER, so a sample straddling a
   *  cell edge reads each side from its own file rather than clamping. */
  function sample(lon: number, lat: number): number {
    const gx = (lon + 180) * INTERVALS;
    const gy = (90 - lat) * INTERVALS;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;

    let acc = 0;
    for (const [dy, wy] of [
      [0, 1 - fy],
      [1, fy],
    ] as const) {
      for (const [dx, wx] of [
        [0, 1 - fx],
        [1, fx],
      ] as const) {
        const w = wx * wy;
        if (w === 0) continue;
        const gxi = x0 + dx;
        const gyi = y0 + dy;
        // floor names the cell for a post on a whole-degree edge, matching
        // `skadiCellsForBounds`: that post is the cell's 3601st row/column.
        const lonCell = Math.floor(gxi / INTERVALS);
        const latCell = Math.ceil(gyi / INTERVALS);
        const value = post(
          90 - latCell,
          lonCell - 180,
          gyi - (latCell - 1) * INTERVALS,
          gxi - lonCell * INTERVALS,
        );
        if (Number.isNaN(value)) return Number.NaN;
        acc += w * value;
      }
    }
    return acc;
  }

  return {
    id: 'skadi-1arcsec',
    attribution: SKADI_PROVENANCE.attribution,
    maxLevel: SKADI_MAX_LEVEL,
    coverage: opts.coverage,
    provenance: SKADI_PROVENANCE,

    async readGrid(z, i0, j0, nx, ny) {
      const box = heightLatticeBounds(z, i0, j0, nx, ny);
      if (!opts.coverage.some((c) => boundsOverlap(c, box))) return null;

      const step = heightLatticeStepDeg(z);
      const grid = new Float32Array(nx * ny);
      for (let jj = 0; jj < ny; jj++) {
        const lat = 90 - (j0 + jj) * step;
        for (let ii = 0; ii < nx; ii++) {
          grid[jj * nx + ii] = sample(-180 + (i0 + ii) * step, lat);
        }
      }
      return grid;
    },

    async boundsInBox(box) {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let latCell = Math.floor(box.south); latCell <= Math.floor(box.north); latCell++) {
        for (let lonCell = Math.floor(box.west); lonCell <= Math.floor(box.east); lonCell++) {
          const posts = cell(latCell, lonCell);
          if (posts === null) continue;
          const rowFrom = Math.max(0, Math.ceil((latCell + 1 - box.north) * INTERVALS));
          const rowTo = Math.min(INTERVALS, Math.floor((latCell + 1 - box.south) * INTERVALS));
          const colFrom = Math.max(0, Math.ceil((box.west - lonCell) * INTERVALS));
          const colTo = Math.min(INTERVALS, Math.floor((box.east - lonCell) * INTERVALS));
          for (let row = rowFrom; row <= rowTo; row++) {
            for (let col = colFrom; col <= colTo; col++) {
              const value = posts[row * POSTS + col]!;
              if (value === VOID) continue;
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
