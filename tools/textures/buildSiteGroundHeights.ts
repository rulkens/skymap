/**
 * buildSiteGroundHeights — bakes each `SURFACE_FIXED_SITES` row's ground
 * height (metres above its host's datum) from the deepest baked height tile
 * under its lat/lon, into `siteGroundHeights.generated.ts`.
 *
 * Samples the full 129x129 Terrain-RGB raster bilinearly, the SAME surface
 * the shader displaces against — not the tile's decimated 17x17 SHGT grid
 * `terrainHeightM` climbs at runtime — so a site's baked height matches the
 * drawn ground exactly rather than a coarser lattice a few metres off it.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { SurfaceFixedSite } from '../../src/@types/scene/SurfaceFixedSite';
import type { SurfaceTileManifest } from '../../src/@types/scene/SurfaceTileManifest';
import { SURFACE_FIXED_SITES } from '../../src/data/bodies/surfaceFixedSites';
import { SURFACE_TILE_PX } from '../../src/data/bodies/surfaceTileParams';
import { SURFACE_TILE_REGISTRY } from '../../src/data/bodies/surfaceTileRegistry';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../src/data/bodies/texturePrimeMeridianU';
import { HEIGHT_POSTS_PER_TILE } from '../../src/data/scene/heightTileFormat';
import { degToRad } from '../../src/utils/math/degToRad';
import { codeHeightM } from '../../src/utils/surfaceTiles/codeHeightM';
import { latticeHeightSample } from '../../src/utils/surfaceTiles/latticeHeightSample';
import { surfaceTileColumns } from '../../src/utils/surfaceTiles/surfaceTileColumns';
import { surfaceTilePath } from '../../src/utils/surfaceTiles/surfaceTilePath';
import { surfaceTileXyForUv } from '../../src/utils/surfaceTiles/surfaceTileXyForUv';

/** Cells across the full raster (129 posts, 128 cells) — the same ×16 vs ×17
 *  trap `terrainHeightM.ts` guards against, here at the raster's own stride. */
const RASTER_CELLS_PER_EDGE = HEIGHT_POSTS_PER_TILE - 1;

const GENERATED_BANNER =
  '// src/data/bodies/siteGroundHeights.generated.ts\n' +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run build-site-ground-heights (also runs at the end\n' +
  '// of a non-dev Mars tile bake)\n' +
  "// Source of truth:  the host's own baked height tiles\n";

function manifestFor(hostId: string): SurfaceTileManifest {
  const registry = SURFACE_TILE_REGISTRY as Record<string, { manifestKey: string } | undefined>;
  const key = registry[hostId]?.manifestKey;
  if (key === undefined) {
    throw new Error(`buildSiteGroundHeights: '${hostId}' has no SURFACE_TILE_REGISTRY row`);
  }
  const path = resolve(`public/data/images/${key}/manifest.json`);
  if (!existsSync(path)) {
    throw new Error(`buildSiteGroundHeights: no manifest at ${path} — bake '${hostId}' first`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as SurfaceTileManifest;
}

/** The deepest band covering `(latDeg, lonDeg)` — several bands can overlap
 *  (a regional site window nested inside the whole-globe band), and the
 *  regional one is always the tighter, deeper-baked read. */
export function deepestBandLevel(
  manifest: SurfaceTileManifest,
  latDeg: number,
  lonDeg: number,
): number {
  const lonW = ((lonDeg + 540) % 360) - 180;
  const hits = manifest.bands.filter(
    (band) =>
      lonW >= band.bounds.west &&
      lonW <= band.bounds.east &&
      latDeg >= band.bounds.south &&
      latDeg <= band.bounds.north,
  );
  if (hits.length === 0) {
    throw new Error(`buildSiteGroundHeights: no band covers (${latDeg}, ${lonDeg})`);
  }
  return Math.max(...hits.map((band) => band.max));
}

/** A decoded height tile's raw pixels — whatever `sharp(...).raw()` hands
 *  back, narrowed to the three fields the sampler reads. */
export type DecodedHeightRaster = {
  readonly data: Uint8Array | Buffer;
  readonly width: number;
  readonly channels: number;
};

/**
 * Bilinear height, metres above the datum, at fractional post position
 * `(colFrac, rowFrac)` (each in `[0, 1)`, tile-relative) inside a decoded
 * 129x129 Terrain-RGB raster — row-major, NORTH row first, exactly the
 * on-disk layout `heightTileFormat.ts` documents. Pure and disk-free so it
 * can be pinned against a synthetic raster without a real baked tile.
 */
export function sampleTileRasterHeightM(
  raster: DecodedHeightRaster,
  colFrac: number,
  rowFrac: number,
): number {
  const postM = (col: number, row: number): number => {
    const c = Math.min(RASTER_CELLS_PER_EDGE, Math.max(0, col));
    const r = Math.min(RASTER_CELLS_PER_EDGE, Math.max(0, row));
    const k = (r * raster.width + c) * raster.channels;
    const code = (raster.data[k]! << 16) | (raster.data[k + 1]! << 8) | raster.data[k + 2]!;
    return codeHeightM(code);
  };

  return latticeHeightSample(
    postM,
    [colFrac * RASTER_CELLS_PER_EDGE, rowFrac * RASTER_CELLS_PER_EDGE],
    1,
    RASTER_CELLS_PER_EDGE,
  );
}

/** Ground height, metres above the datum, at `site`'s lat/lon — the uv/tile
 *  maths mirrors `terrainHeightM.ts` exactly (same prime-meridian
 *  registration, same north-row-first raster), reading the deepest band's
 *  own tile file instead of climbing a resident ancestor. */
async function sampleGroundHeightM(
  site: SurfaceFixedSite,
  manifest: SurfaceTileManifest,
): Promise<number> {
  const z = deepestBandLevel(manifest, site.latDeg, site.lonDeg);
  const lon = degToRad(site.lonDeg);
  const lat = degToRad(site.latDeg);
  const u = lon / (2 * Math.PI) + TEXTURE_PRIME_MERIDIAN_U;
  const v = lat / Math.PI + 0.5;

  const cols = surfaceTileColumns(z, SURFACE_TILE_PX);
  const rows = cols / 2;
  const [x, y] = surfaceTileXyForUv([u, v], z, SURFACE_TILE_PX);
  const colFrac = u * cols - Math.floor(u * cols);
  const rowFrac = Math.min(1, Math.max(0, (1 - v) * rows - y));

  const tilePath = resolve(
    `public/data/images/${surfaceTilePath({ product: 'height', z, x, y }, manifest.prefix)}`,
  );
  if (!existsSync(tilePath)) {
    throw new Error(`buildSiteGroundHeights: '${site.id}' names missing tile ${tilePath}`);
  }
  const { data, info } = await sharp(readFileSync(tilePath))
    .raw()
    .toBuffer({ resolveWithObject: true });

  return sampleTileRasterHeightM(
    { data, width: info.width, channels: info.channels },
    colFrac,
    rowFrac,
  );
}

function serialize(heights: ReadonlyMap<string, number>): string {
  const rows = [...heights.entries()].map(([id, m]) => `  ${id}: ${m},`).join('\n');
  return (
    GENERATED_BANNER +
    '\n' +
    "/** Site id -> ground height, metres above the host's datum, bilinearly\n" +
    ' *  sampled from the deepest baked height tile under the site (see the\n' +
    ' *  generator). */\n' +
    'export const SITE_GROUND_HEIGHTS: Readonly<Record<string, number>> = {\n' +
    `${rows}\n};\n`
  );
}

export async function buildSiteGroundHeights(): Promise<void> {
  const heights = new Map<string, number>();
  for (const site of SURFACE_FIXED_SITES) {
    const manifest = manifestFor(site.hostId);
    const m = await sampleGroundHeightM(site, manifest);
    heights.set(site.id, m);
    process.stderr.write(`  ${site.id}: ${m.toFixed(1)} m\n`);
  }
  writeFileSync(resolve('src/data/bodies/siteGroundHeights.generated.ts'), serialize(heights));
  process.stderr.write(`  ok   siteGroundHeights.generated.ts  (${heights.size} sites)\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  buildSiteGroundHeights().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
