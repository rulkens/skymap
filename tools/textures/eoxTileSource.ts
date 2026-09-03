/**
 * eoxTileSource — an `EarthImagerySource` over the EOX s2cloudless z13
 * harvest (`fetchEoxTiles.ts`'s output: `<region>/<z>/<row>/<col>.jpg`,
 * 256 px tiles). EOX's WGS84 TMS grid at z13 is exactly HALF skymap's own
 * 512 px tile edge (`earthTileColumns.ts`), so one skymap z13 box is always
 * a 2x2 block of EOX tiles at the SAME z — no ladder re-numbering, just a
 * composite. `coverageDir` holds one subdirectory per harvested region
 * (`data/raw/eox/README.md`); `coverage` gets one box per region, read off
 * disk at startup (each region's own bounding row/col rectangle, converted
 * to degrees), so a short harvest shrinks its box instead of silently
 * claiming ground it doesn't have.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import type { EarthImagerySource } from './EarthImagerySource';
import { matchEoxSeaColour } from './matchEoxSeaColour';
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
  sourceId: 'eox-s2cloudless-2025',
  attribution:
    'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH ' +
    '(Contains modified Copernicus Sentinel data 2025). Published under ' +
    'CC BY-NC-SA 4.0; used in skymap with written permission from EOX IT ' +
    'Services GmbH.',
  vintage: '2025',
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
 *  `coverageDir` — the harvest's own footprint, not a requested bbox.
 *  `fileCount` lets the caller assert the rect is actually CONTIGUOUS: a
 *  full rectangle has `fileCount === (rowMax-rowMin+1)*(colMax-colMin+1)`,
 *  fewer means the harvest tree spans a gap (e.g. two disjoint regions). */
function scanCoverage(coverageDir: string): {
  rowMin: number;
  rowMax: number;
  colMin: number;
  colMax: number;
  fileCount: number;
} {
  const levelDir = join(coverageDir, String(EOX_MAX_LEVEL));
  if (!existsSync(levelDir)) {
    throw new Error(`eoxTileSource: no z${EOX_MAX_LEVEL} tiles found under ${levelDir}`);
  }

  let rowMin = Infinity;
  let rowMax = -Infinity;
  let colMin = Infinity;
  let colMax = -Infinity;
  let fileCount = 0;

  for (const rowEntry of readdirSync(levelDir, { withFileTypes: true })) {
    if (!rowEntry.isDirectory()) continue;
    const row = Number(rowEntry.name);
    for (const fileName of readdirSync(join(levelDir, rowEntry.name))) {
      if (!fileName.endsWith('.jpg')) continue;
      const col = Number(fileName.slice(0, -'.jpg'.length));
      fileCount++;
      rowMin = Math.min(rowMin, row);
      rowMax = Math.max(rowMax, row);
      colMin = Math.min(colMin, col);
      colMax = Math.max(colMax, col);
    }
  }

  if (!Number.isFinite(rowMin)) {
    throw new Error(`eoxTileSource: no z${EOX_MAX_LEVEL} tiles found under ${levelDir}`);
  }
  return { rowMin, rowMax, colMin, colMax, fileCount };
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

type RegionRect = {
  readonly rowMin: number;
  readonly rowMax: number;
  readonly colMin: number;
  readonly colMax: number;
};

/** Every child directory of `coverageDir` that holds a z13 tree — one entry
 *  per harvested region, sorted by name so `coverage` order is deterministic.
 *  A flat `<coverageDir>/13/` (the pre-migration layout) throws by name: it
 *  has no region to own it, and silently treating it as "region ''" would
 *  hide the migration rather than force it. */
function discoverRegionDirs(coverageDir: string): string[] {
  if (existsSync(join(coverageDir, String(EOX_MAX_LEVEL)))) {
    throw new Error(
      `eoxTileSource: found a flat z${EOX_MAX_LEVEL} tree directly under ${coverageDir} — ` +
        `the current layout is per-region (<region>/${EOX_MAX_LEVEL}/<row>/<col>.jpg, see ` +
        `data/raw/eox/README.md); move this harvest under its own region subdirectory.`,
    );
  }

  const regions = readdirSync(coverageDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(coverageDir, entry.name, String(EOX_MAX_LEVEL))),
    )
    .map((entry) => entry.name)
    .sort();

  if (regions.length === 0) {
    throw new Error(
      `eoxTileSource: no region subdirectories with z${EOX_MAX_LEVEL} tiles found under ${coverageDir}`,
    );
  }
  return regions;
}

function rectContains(rect: RegionRect, row: number, col: number): boolean {
  return row >= rect.rowMin && row <= rect.rowMax && col >= rect.colMin && col <= rect.colMax;
}

export async function eoxTileSource(opts: {
  readonly coverageDir: string; // rawDataPath('eox.dir')
}): Promise<EarthImagerySource> {
  // Regions sorted by name (see `discoverRegionDirs`), so `regions` below —
  // and thus `coverage` and readBox's first-by-name-wins tile lookup — are
  // both deterministic regardless of directory-read order.
  const regions = discoverRegionDirs(opts.coverageDir).map((name) => {
    const rect = scanCoverage(join(opts.coverageDir, name));
    // A cheap per-region contiguity assertion, not a full connected-components
    // check: this source declares one box PER REGION (see the module header),
    // so a rect whose area exceeds its file count means that region's own
    // harvest tree spans a gap — and this box would silently claim ground
    // never actually harvested.
    const rectArea = (rect.rowMax - rect.rowMin + 1) * (rect.colMax - rect.colMin + 1);
    if (rectArea !== rect.fileCount) {
      throw new Error(
        `eoxTileSource: region "${name}" under ${opts.coverageDir} is incomplete or spans a gap ` +
          `(${rect.fileCount} tiles found, ${rectArea} expected for one contiguous patch) — see ` +
          `the per-region layout contract in data/raw/eox/README.md`,
      );
    }
    return { name, rect };
  });
  const coverage = regions.map(({ rect }) => boundsForRowColRect(rect));

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
      ].map((child) => {
        // Regions are disjoint in practice; `find` (first-by-name) is the
        // tie-break for the pathological case where two rects both claim a
        // tile. `existsSync` below still gates the actual read, as today.
        const owner = regions.find((region) => rectContains(region.rect, child.row, child.col));
        const path = owner
          ? eoxTilePath(join(opts.coverageDir, owner.name), EOX_MAX_LEVEL, child.row, child.col)
          : null;
        return { ...child, path };
      });

      // A decline only when the block is EMPTY: a source with SOME coverage
      // has something real to offer, and `underfillImagerySource` fills the
      // missing quadrants from the global band rather than this source
      // returning a partial-but-transparent tile itself.
      const present = children.filter(
        (child): child is (typeof children)[number] & { path: string } =>
          child.path !== null && existsSync(child.path),
      );
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

      // Sea colour match runs here, at z13 (the only level this source ever
      // reads at) — coarser levels inherit it via the bake's own 2x2 average.
      return matchEoxSeaColour(new Uint8Array(composited), NATIVE_EDGE_PX, NATIVE_EDGE_PX);
    },
  };
}
