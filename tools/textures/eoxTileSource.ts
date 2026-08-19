/**
 * eoxTileSource — an `EarthImagerySource` over the EOX s2cloudless z13
 * harvest (`fetchEoxTiles.ts`'s output: `<z>/<row>/<col>.jpg`, 256 px tiles).
 * EOX's WGS84 TMS grid at z13 is exactly HALF skymap's own 512 px tile edge
 * (`earthTileColumns.ts`), so one skymap z13 box is always a 2x2 block of
 * EOX tiles at the SAME z — no ladder re-numbering, just a composite.
 * `coverage` is read off disk at startup (the harvest's own bounding
 * row/col rectangle, converted to degrees), so a short harvest shrinks the
 * manifest entry instead of silently claiming ground it doesn't have.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import type { EarthImagerySource } from './EarthImagerySource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/** EOX only ever harvests z13 (`fetchEoxTiles.ts`'s header) — coarser levels
 *  are derived at bake time by the existing 2x2 average, same as BMNG. */
const EOX_MAX_LEVEL = 13;

/** Native edge of one harvested EOX tile. */
const EOX_TILE_PX = 256;

/** Native edge of the 2x2-composited output — always `EARTH_TILE_PX`, by the
 *  ladder identity in the module header. */
const NATIVE_EDGE_PX = EOX_TILE_PX * 2;

/** Verbatim from spec §4 — this source's own identity, carried into the
 *  manifest's `builtFrom` for every band `bakeAll` builds from it. */
const EOX_PROVENANCE = {
  sourceId: 'eox-s2cloudless-2016',
  attribution:
    'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH ' +
    '(Contains modified Copernicus Sentinel data 2016) released under ' +
    'Creative Commons Attribution 4.0 International License.',
  vintage: '2016',
} as const;

/** Degrees spanned by one EOX tile at `z`, in both axes (`180 / rows` —
 *  see `fetchEoxTiles.ts`'s `eoxTileIndicesForBbox` for why lon and lat
 *  share the same step). */
function eoxTileDeg(z: number): number {
  return 180 / 2 ** z;
}

function eoxTilePath(coverageDir: string, z: number, row: number, col: number): string {
  return join(coverageDir, String(z), String(row), `${col}.jpg`);
}

/**
 * The EOX tile whose NW corner is `(lon, lat)` — the inverse of
 * `eoxTileIndicesForBbox`'s per-tile bbox math, for one point instead of a
 * range. `round`, not `floor`: the box handed to `readBox` is always built
 * from the same `180 / 2^z` step this function divides by, so the true
 * quotient is an exact integer and only float noise can land it a hair
 * either side of one — `floor` would occasionally read that noise as the
 * tile one row/column short.
 */
function eoxTileAt(lon: number, lat: number, z: number): { row: number; col: number } {
  const tileDeg = eoxTileDeg(z);
  return {
    row: Math.round((90 - lat) / tileDeg),
    col: Math.round((lon + 180) / tileDeg),
  };
}

/** Bounding row/col rectangle of every `<z>/<row>/<col>.jpg` under
 *  `coverageDir` — the harvest's own footprint, not a requested bbox. */
function scanCoverage(coverageDir: string): { rowMin: number; rowMax: number; colMin: number; colMax: number } {
  const levelDir = join(coverageDir, String(EOX_MAX_LEVEL));
  let rowMin = Infinity;
  let rowMax = -Infinity;
  let colMin = Infinity;
  let colMax = -Infinity;

  for (const rowEntry of readdirSync(levelDir, { withFileTypes: true })) {
    if (!rowEntry.isDirectory()) continue;
    const row = Number(rowEntry.name);
    for (const fileName of readdirSync(join(levelDir, rowEntry.name))) {
      if (!fileName.endsWith('.jpg')) continue;
      const col = Number(fileName.slice(0, -'.jpg'.length));
      rowMin = Math.min(rowMin, row);
      rowMax = Math.max(rowMax, row);
      colMin = Math.min(colMin, col);
      colMax = Math.max(colMax, col);
    }
  }

  if (!Number.isFinite(rowMin)) {
    throw new Error(`eoxTileSource: no z${EOX_MAX_LEVEL} tiles found under ${levelDir}`);
  }
  return { rowMin, rowMax, colMin, colMax };
}

function boundsForRowColRect(rect: {
  rowMin: number;
  rowMax: number;
  colMin: number;
  colMax: number;
}): LonLatBounds {
  const tileDeg = eoxTileDeg(EOX_MAX_LEVEL);
  return {
    west: rect.colMin * tileDeg - 180,
    east: (rect.colMax + 1) * tileDeg - 180,
    north: 90 - rect.rowMin * tileDeg,
    south: 90 - (rect.rowMax + 1) * tileDeg,
  };
}

export async function eoxTileSource(opts: {
  readonly coverageDir: string; // rawDataPath('eox.dir')
}): Promise<EarthImagerySource> {
  const coverage = [boundsForRowColRect(scanCoverage(opts.coverageDir))];

  return {
    id: EOX_PROVENANCE.sourceId,
    attribution: EOX_PROVENANCE.attribution,
    maxLevel: EOX_MAX_LEVEL,
    coverage,
    provenance: EOX_PROVENANCE,

    async readBox(box, widthPx, heightPx) {
      // Checked first, before any disk read or compositing: the module
      // header's ladder identity guarantees every real caller requests
      // exactly `NATIVE_EDGE_PX`, so a mismatch means that identity broke
      // (e.g. `EARTH_TILE_PX` moved off 512) — a loud, CHEAP failure, not a
      // silently-added, silently-untested resize branch after the work.
      if (widthPx !== NATIVE_EDGE_PX || heightPx !== NATIVE_EDGE_PX) {
        throw new Error(
          `eoxTileSource: readBox asked for ${widthPx}x${heightPx}, but the EOX/skymap z13 ladder ` +
            `identity only produces ${NATIVE_EDGE_PX}x${NATIVE_EDGE_PX} composites`,
        );
      }

      const nw = eoxTileAt(box.west, box.north, EOX_MAX_LEVEL);
      const children = [
        { i: 0, j: 0, row: nw.row, col: nw.col },
        { i: 1, j: 0, row: nw.row, col: nw.col + 1 },
        { i: 0, j: 1, row: nw.row + 1, col: nw.col },
        { i: 1, j: 1, row: nw.row + 1, col: nw.col + 1 },
      ].map((child) => ({
        ...child,
        path: eoxTilePath(opts.coverageDir, EOX_MAX_LEVEL, child.row, child.col),
      }));

      // A decline only when the block is EMPTY: a source with SOME coverage
      // has something real to offer, and `underfillImagerySource` fills the
      // missing quadrants from the global band rather than this source
      // returning a partial-but-transparent tile itself.
      const present = children.filter((child) => existsSync(child.path));
      if (present.length === 0) return null;

      // Per-child read only — already native size, so a resize here would be
      // a no-op today; compositing them straight in (never resizing the
      // canvas AFTER `.composite()` — see `buildEarthTiles.ts:150-160`)
      // matches `bakeCoarserLevel`'s pipeline shape for the same libvips reason.
      const quadrants = await Promise.all(
        present.map(async (child) => ({
          input: await sharp(child.path).ensureAlpha().raw().toBuffer(),
          raw: { width: EOX_TILE_PX, height: EOX_TILE_PX, channels: 4 as const },
          left: child.i * EOX_TILE_PX,
          top: child.j * EOX_TILE_PX,
        })),
      );

      const composited = await sharp({
        create: {
          width: NATIVE_EDGE_PX,
          height: NATIVE_EDGE_PX,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(quadrants)
        .raw()
        .toBuffer();

      return new Uint8Array(composited);
    },
  };
}
