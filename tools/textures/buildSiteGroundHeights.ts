/**
 * buildSiteGroundHeights — bakes each `SURFACE_FIXED_SITES` row's ground
 * height (metres above its host's datum) and ground up vector from the deepest
 * baked height tile under its lat/lon, into `siteGroundHeights.generated.ts`.
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

import type { Vec3 } from '../../src/@types/math/Vec3';
import type { SurfaceFixedSite } from '../../src/@types/scene/SurfaceFixedSite';
import type { SurfaceTileManifest } from '../../src/@types/scene/SurfaceTileManifest';
import { MESH_ASSETS } from '../../src/data/bodies/meshAssets.generated';
import { SCENE_CELESTIAL_BODIES } from '../../src/data/bodies/sceneCelestialBodies';
import { SCENE_MESH_BODIES } from '../../src/data/bodies/sceneMeshBodies';
import { SURFACE_FIXED_SITES } from '../../src/data/bodies/surfaceFixedSites';
import { SURFACE_TILE_REGISTRY } from '../../src/data/bodies/surfaceTileRegistry';
import { HEIGHT_POSTS_PER_TILE } from '../../src/data/scene/heightTileFormat';
import { degToRad } from '../../src/utils/math/degToRad';
import { findByIdOrThrow } from '../../src/utils/object/findByIdOrThrow';
import { codeHeightM } from '../../src/utils/surfaceTiles/codeHeightM';
import { latticeHeightSample } from '../../src/utils/surfaceTiles/latticeHeightSample';
import { surfaceTilePath } from '../../src/utils/surfaceTiles/surfaceTilePath';
import { terrainUpEnu } from '../utils/textures/terrainUpEnu';
import { tilePostAtLatLon } from '../utils/textures/tilePostAtLatLon';

const RAD_TO_DEG = 180 / Math.PI;

/** Cells across the full raster (129 posts, 128 cells) — the same ×16 vs ×17
 *  trap `terrainHeightM.ts` guards against, here at the raster's own stride. */
const RASTER_CELLS_PER_EDGE = HEIGHT_POSTS_PER_TILE - 1;

const GENERATED_BANNER =
  '// src/data/bodies/siteGroundHeights.generated.ts\n' +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run build-site-ground-heights (also runs at the end\n' +
  '// of a non-dev Mars tile bake)\n' +
  "// Source of truth:  the host's own baked height tiles\n";

export function manifestFor(hostId: string): SurfaceTileManifest {
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

/** Ground height, metres above the datum, at a lat/lon on band level `z` — the
 *  uv/tile maths mirrors `terrainHeightM.ts` exactly (same prime-meridian
 *  registration, same north-row-first raster), reading that band's own tile
 *  file instead of climbing a resident ancestor. */
async function groundHeightAtM(
  manifest: SurfaceTileManifest,
  latDeg: number,
  lonDeg: number,
  z: number,
): Promise<number> {
  const { x, y, colFrac, rowFrac } = tilePostAtLatLon(latDeg, lonDeg, z);

  const tilePath = resolve(
    `public/data/images/${surfaceTilePath({ product: 'height', z, x, y }, manifest.prefix)}`,
  );
  if (!existsSync(tilePath)) {
    throw new Error(`buildSiteGroundHeights: (${latDeg}, ${lonDeg}) names missing ${tilePath}`);
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

export async function siteGroundHeightM(
  site: SurfaceFixedSite,
  manifest: SurfaceTileManifest,
): Promise<number> {
  const z = deepestBandLevel(manifest, site.latDeg, site.lonDeg);
  return groundHeightAtM(manifest, site.latDeg, site.lonDeg, z);
}

/** The ground's up under `site`, as (east, north, up): a plane fitted across
 *  the body's own half-width, the span its contact points actually average the
 *  slope over. A one-post baseline would read tile quantisation instead. */
export async function siteGroundUpEnu(
  site: SurfaceFixedSite,
  manifest: SurfaceTileManifest,
): Promise<Vec3> {
  const host = findByIdOrThrow(SCENE_CELESTIAL_BODIES, site.hostId, 'buildSiteGroundHeights');
  const { meshKey } = findByIdOrThrow(SCENE_MESH_BODIES, site.id, 'buildSiteGroundHeights');
  const asset = MESH_ASSETS[meshKey];
  if (asset === undefined) {
    throw new Error(`buildSiteGroundHeights: no MESH_ASSETS entry for '${meshKey}'`);
  }
  const baselineM = asset.boundingRadiusM;
  const z = deepestBandLevel(manifest, site.latDeg, site.lonDeg);
  const dLatDeg = (baselineM / host.surface.datumRadiusM) * RAD_TO_DEG;
  const dLonDeg = dLatDeg / Math.cos(degToRad(site.latDeg));
  const at = (latDeg: number, lonDeg: number) => groundHeightAtM(manifest, latDeg, lonDeg, z);
  const [northM, southM, eastM, westM] = await Promise.all([
    at(site.latDeg + dLatDeg, site.lonDeg),
    at(site.latDeg - dLatDeg, site.lonDeg),
    at(site.latDeg, site.lonDeg + dLonDeg),
    at(site.latDeg, site.lonDeg - dLonDeg),
  ]);
  return terrainUpEnu(northM, southM, eastM, westM, baselineM);
}

function serialize(heights: ReadonlyMap<string, number>, ups: ReadonlyMap<string, Vec3>): string {
  const heightRows = [...heights.entries()].map(([id, m]) => `  ${id}: ${m},`).join('\n');
  const upRows = [...ups.entries()].map(([id, up]) => `  ${id}: [${up.join(', ')}],`).join('\n');
  return (
    GENERATED_BANNER +
    '\n' +
    "import type { Vec3 } from '../../@types/math/Vec3';\n" +
    '\n' +
    "/** Site id -> ground height, metres above the host's datum, bilinearly\n" +
    ' *  sampled from the deepest baked height tile under the site (see the\n' +
    ' *  generator). */\n' +
    'export const SITE_GROUND_HEIGHTS: Readonly<Record<string, number>> = {\n' +
    `${heightRows}\n};\n` +
    '\n' +
    "/** Site id -> the ground's up in the site's radial (east, north, up) frame,\n" +
    " *  fitted across the body's own footprint; flat ground is [0, 0, 1]. */\n" +
    'export const SITE_GROUND_UPS_ENU: Readonly<Record<string, Readonly<Vec3>>> = {\n' +
    `${upRows}\n};\n`
  );
}

export async function buildSiteGroundHeights(): Promise<void> {
  const heights = new Map<string, number>();
  const ups = new Map<string, Vec3>();
  for (const site of SURFACE_FIXED_SITES) {
    const manifest = manifestFor(site.hostId);
    const m = await siteGroundHeightM(site, manifest);
    const up = await siteGroundUpEnu(site, manifest);
    heights.set(site.id, m);
    ups.set(site.id, up);
    const tiltDeg = Math.acos(Math.min(1, up[2])) * RAD_TO_DEG;
    process.stderr.write(`  ${site.id}: ${m.toFixed(1)} m, tilt ${tiltDeg.toFixed(2)}°\n`);
  }
  writeFileSync(resolve('src/data/bodies/siteGroundHeights.generated.ts'), serialize(heights, ups));
  process.stderr.write(`  ok   siteGroundHeights.generated.ts  (${heights.size} sites)\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  buildSiteGroundHeights().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
