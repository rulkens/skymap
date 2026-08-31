/**
 * preTiledBand — scan a directory of already-rendered `<z>/<x>/<y>.webp`
 * tiles on skymap's own equirect grid (GeoDanmark: every level rendered
 * natively by the WMS server, fully opaque) into a band `bakeAll` copies
 * byte-for-byte instead of pyramiding from an `EarthImagerySource`.
 * Pyramiding (bake z19, average down) would leave edge parents with
 * partial children — transparent margins the runtime alpha-blends over
 * the base globe, the bug `underfillImagerySource` fixes for EOX; EOX's
 * own `readBox` can't underfill z14-19 boxes — it hard-asserts z13.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { EarthTileProvenance } from '../../src/@types/scene/EarthTileProvenance';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';
import { earthTileColumns } from '../../src/utils/scene/earthTileColumns';

export type PreTiledBand = {
  readonly id: string;
  readonly provenance: EarthTileProvenance;
  readonly sourceDir: string;
  readonly minLevel: number;
  readonly maxLevel: number;
  /** Ground the band covers, derived from the DEEPEST level's on-disk rect —
   *  the coarser levels are asserted to cover at least this much (see below). */
  readonly coverage: ReadonlyArray<LonLatBounds>;
  readonly tiles: ReadonlyArray<{ readonly z: number; readonly x: number; readonly y: number }>;
};

type Rect = { xMin: number; xMax: number; yMin: number; yMax: number; fileCount: number };

/** Bounding `(x, y)` rect of every `<z>/<x>/<y>.webp` under `sourceDir` —
 *  `fileCount` lets the caller assert the rect is actually CONTIGUOUS, same
 *  shape as `eoxTileSource.scanCoverage`. */
function scanLevel(sourceDir: string, z: number): Rect {
  const levelDir = join(sourceDir, String(z));
  if (!existsSync(levelDir)) {
    throw new Error(`preTiledBand: no z${z} tiles found under ${levelDir}`);
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
      if (!fileName.endsWith('.webp')) continue;
      const y = Number(fileName.slice(0, -'.webp'.length));
      fileCount++;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
  }

  if (!Number.isFinite(xMin)) {
    throw new Error(`preTiledBand: no z${z} tiles found under ${levelDir}`);
  }
  const rectArea = (xMax - xMin + 1) * (yMax - yMin + 1);
  if (rectArea !== fileCount) {
    throw new Error(
      `preTiledBand: z${z} under ${sourceDir} is incomplete or spans a gap (${fileCount} tiles ` +
        `found, ${rectArea} expected for one contiguous rect)`,
    );
  }
  return { xMin, xMax, yMin, yMax, fileCount };
}

function boundsForRect(rect: Rect, z: number, tilePx: number): LonLatBounds {
  const columns = earthTileColumns(z, tilePx);
  const rows = columns / 2;
  const lonStep = 360 / columns;
  const latStep = 180 / rows;
  return {
    west: rect.xMin * lonStep - 180,
    east: (rect.xMax + 1) * lonStep - 180,
    north: 90 - rect.yMin * latStep,
    south: 90 - (rect.yMax + 1) * latStep,
  };
}

function containsBounds(outer: LonLatBounds, inner: LonLatBounds): boolean {
  return (
    outer.west <= inner.west &&
    outer.east >= inner.east &&
    outer.south <= inner.south &&
    outer.north >= inner.north
  );
}

/**
 * Scan `sourceDir` for `[minLevel, maxLevel]` and describe it as a
 * `PreTiledBand`. Grids nest, so every coarser level's on-disk rect must
 * cover the deepest level's ground; asserted per level (not assumed) so a
 * half-harvested coarse level fails loudly here rather than shipping a band
 * whose runtime 404s at some levels but not others.
 */
export function scanPreTiledBand(opts: {
  readonly id: string;
  readonly provenance: EarthTileProvenance;
  readonly sourceDir: string;
  readonly minLevel: number;
  readonly maxLevel: number;
}): PreTiledBand {
  const { id, provenance, sourceDir, minLevel, maxLevel } = opts;
  const rects = new Map<number, Rect>();
  const tiles: Array<{ z: number; x: number; y: number }> = [];

  for (let z = minLevel; z <= maxLevel; z++) {
    const rect = scanLevel(sourceDir, z);
    rects.set(z, rect);
    for (let x = rect.xMin; x <= rect.xMax; x++) {
      for (let y = rect.yMin; y <= rect.yMax; y++) tiles.push({ z, x, y });
    }
  }
  tiles.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);

  const deepestBounds = boundsForRect(rects.get(maxLevel)!, maxLevel, EARTH_TILE_PX);
  for (let z = minLevel; z < maxLevel; z++) {
    const levelBounds = boundsForRect(rects.get(z)!, z, EARTH_TILE_PX);
    if (!containsBounds(levelBounds, deepestBounds)) {
      throw new Error(
        `preTiledBand: z${z} under ${sourceDir} doesn't cover the z${maxLevel} rect's ground — ` +
          `a half-harvested coarser level, run a full harvest`,
      );
    }
  }

  return { id, provenance, sourceDir, minLevel, maxLevel, coverage: [deepestBounds], tiles };
}
