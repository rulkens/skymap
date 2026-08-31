/**
 * geodanmarkTileSource — an `EarthImagerySource` over the GeoDanmark z19
 * orthophoto harvest (`data/raw/geodanmark/README.md`): `<x>/<y>.jpg` tiles
 * ALREADY on skymap's own equirect grid (512 px, x0 at -180 east-positive,
 * y0 at +90 south-positive) — unlike EOX's own TMS grid, no re-indexing or
 * 2x2 compositing, just a 1:1 lookup and JPEG decode. The harvest bbox must
 * be SNAPPED to `minLevel`'s tile grid (the caller passes it in, single
 * source of truth with `buildEarthTiles.ts`'s band wiring): every parent
 * down to z18 then has all four children, so this band needs no
 * `underfill` — misalignment throws at construction instead of silently
 * baking transparent edge parents.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import type { EarthImagerySource } from './EarthImagerySource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';
import { earthTileColumns } from '../../src/utils/scene/earthTileColumns';

/** Deepest (and only) level the Søndermarken harvest reaches — the WMS
 *  server rendered z19 natively; every coarser level is a bake-time 2x2
 *  average, same as EOX derives z8-z12 from its own z13 harvest. */
const GEODANMARK_MAX_LEVEL = 19;

/** Verbatim from `data/raw/geodanmark/README.md`. */
const GEODANMARK_PROVENANCE = {
  sourceId: 'geodanmark-2025-10cm',
  attribution: 'Ortofoto © GeoDanmark / Klimadatastyrelsen (CC BY 4.0)',
  vintage: 'forår 2025',
} as const;

/** Degrees per tile at `z`, identical on both axes at the shipped 512 px
 *  edge — the same ladder `tileBox`/`earthTileIndicesForBounds` use, so a
 *  box this source is handed always lands on an exact multiple. */
function tileDeg(z: number): number {
  return 360 / earthTileColumns(z, EARTH_TILE_PX);
}

/**
 * The z19 tile whose NW corner is `(lon, lat)`. `round`, not `floor`: the
 * box handed to `readBox` is always built from this same `tileDeg` step, so
 * the true quotient is an exact integer and only float noise can land it a
 * hair either side of one — `floor` would occasionally read that noise as
 * the tile one row/column short (see `eoxTileSource.eoxTileAt`).
 */
function tileAt(lon: number, lat: number): { x: number; y: number } {
  const deg = tileDeg(GEODANMARK_MAX_LEVEL);
  return {
    x: Math.round((lon + 180) / deg),
    y: Math.round((90 - lat) / deg),
  };
}

type Rect = { xMin: number; xMax: number; yMin: number; yMax: number; fileCount: number };

/** Bounding `(x, y)` rect of every `<x>/<y>.jpg` under `<coverageDir>/19` —
 *  `fileCount` lets the caller assert the rect is actually CONTIGUOUS, same
 *  shape as `eoxTileSource.scanCoverage`. */
function scanCoverage(coverageDir: string): Rect {
  const levelDir = join(coverageDir, String(GEODANMARK_MAX_LEVEL));
  if (!existsSync(levelDir)) {
    throw new Error(
      `geodanmarkTileSource: no z${GEODANMARK_MAX_LEVEL} tiles found under ${levelDir}`,
    );
  }

  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let fileCount = 0;

  for (const xEntry of readdirSync(levelDir, { withFileTypes: true })) {
    if (!xEntry.isDirectory()) continue;
    const x = Number(xEntry.name);
    for (const fileName of readdirSync(join(levelDir, xEntry.name))) {
      if (!fileName.endsWith('.jpg')) continue;
      const y = Number(fileName.slice(0, -'.jpg'.length));
      fileCount++;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
  }

  if (!Number.isFinite(xMin)) {
    throw new Error(
      `geodanmarkTileSource: no z${GEODANMARK_MAX_LEVEL} tiles found under ${levelDir}`,
    );
  }
  return { xMin, xMax, yMin, yMax, fileCount };
}

function boundsForRect(rect: Rect): LonLatBounds {
  const deg = tileDeg(GEODANMARK_MAX_LEVEL);
  return {
    west: rect.xMin * deg - 180,
    east: (rect.xMax + 1) * deg - 180,
    north: 90 - rect.yMin * deg,
    south: 90 - (rect.yMax + 1) * deg,
  };
}

export async function geodanmarkTileSource(opts: {
  readonly coverageDir: string; // rawDataPath('geodanmark.dir')
  /** The band floor this source bakes down to — every edge of the harvest
   *  rect must be a multiple of `2^(19 - minLevel)` tiles (see module
   *  header); pass the same constant `buildEarthTiles.ts` wires as the
   *  band's own `minLevel`. */
  readonly minLevel: number;
}): Promise<EarthImagerySource> {
  const rect = scanCoverage(opts.coverageDir);

  const rectArea = (rect.xMax - rect.xMin + 1) * (rect.yMax - rect.yMin + 1);
  if (rectArea !== rect.fileCount) {
    throw new Error(
      `geodanmarkTileSource: harvest under ${opts.coverageDir} is incomplete or spans a gap ` +
        `(${rect.fileCount} tiles found, ${rectArea} expected for one contiguous rect)`,
    );
  }

  // The load-bearing assert (see module header): an edge not divisible by
  // the modulus means at least one z(minLevel..18) parent inside coverage is
  // missing a child, which bakes a transparent quadrant this band has no
  // underfill source to patch.
  const modulus = 2 ** (GEODANMARK_MAX_LEVEL - opts.minLevel);
  const aligned =
    rect.xMin % modulus === 0 &&
    (rect.xMax + 1) % modulus === 0 &&
    rect.yMin % modulus === 0 &&
    (rect.yMax + 1) % modulus === 0;
  if (!aligned) {
    throw new Error(
      `geodanmarkTileSource: harvest rect x[${rect.xMin}..${rect.xMax}] y[${rect.yMin}..${rect.yMax}] ` +
        `under ${opts.coverageDir} isn't snapped to the z${opts.minLevel} tile grid (every edge must be ` +
        `divisible by ${modulus}) — re-harvest with a bbox snapped to that grid`,
    );
  }

  return {
    id: GEODANMARK_PROVENANCE.sourceId,
    attribution: GEODANMARK_PROVENANCE.attribution,
    maxLevel: GEODANMARK_MAX_LEVEL,
    coverage: [boundsForRect(rect)],
    provenance: GEODANMARK_PROVENANCE,

    async readBox(box, widthPx, heightPx) {
      // Checked first, before any disk read: every real caller requests a
      // z19 tile box at exactly `EARTH_TILE_PX` — a mismatch means the 1:1
      // ladder identity in the module header broke, a loud CHEAP failure
      // rather than a silently-added resize branch (see `eoxTileSource`).
      if (widthPx !== EARTH_TILE_PX || heightPx !== EARTH_TILE_PX) {
        throw new Error(
          `geodanmarkTileSource: readBox asked for ${widthPx}x${heightPx}, but the z19 harvest is a ` +
            `1:1 lookup that only produces ${EARTH_TILE_PX}x${EARTH_TILE_PX} tiles`,
        );
      }

      const { x, y } = tileAt(box.west, box.north);
      if (x < rect.xMin || x > rect.xMax || y < rect.yMin || y > rect.yMax) return null;

      const path = join(opts.coverageDir, String(GEODANMARK_MAX_LEVEL), String(x), `${y}.jpg`);
      if (!existsSync(path)) return null;

      const raw = await sharp(path).ensureAlpha().raw().toBuffer();
      return new Uint8Array(raw);
    },
  };
}
