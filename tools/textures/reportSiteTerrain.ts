/**
 * reportSiteTerrain — read-only survey of the ground under every
 * `SURFACE_FIXED_SITES` row: the committed height's drift against today's
 * tiles, the terrain's up vector, and the tile's relief (a near-flat one means
 * the site sits on fill, not data). Writes nothing.
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import type { HeightTile } from './HeightTile';
import type { SurfaceTileManifest } from '../../src/@types/scene/SurfaceTileManifest';
import { MESH_ASSETS } from '../../src/data/bodies/meshAssets.generated';
import { SCENE_CELESTIAL_BODIES } from '../../src/data/bodies/sceneCelestialBodies';
import { SCENE_MESH_BODIES } from '../../src/data/bodies/sceneMeshBodies';
import { SITE_GROUND_HEIGHTS } from '../../src/data/bodies/siteGroundHeights.generated';
import { SURFACE_FIXED_SITES } from '../../src/data/bodies/surfaceFixedSites';
import { HEIGHT_POSTS_PER_TILE } from '../../src/data/scene/heightTileFormat';
import { degToRad } from '../../src/utils/math/degToRad';
import { findByIdOrThrow } from '../../src/utils/object/findByIdOrThrow';
import { latticeHeightSample } from '../../src/utils/surfaceTiles/latticeHeightSample';
import { surfaceTilePath } from '../../src/utils/surfaceTiles/surfaceTilePath';
import { readHeightTileFile } from '../utils/textures/readHeightTileFile';
import { terrainUpEnu } from '../utils/textures/terrainUpEnu';
import { tilePostAtLatLon } from '../utils/textures/tilePostAtLatLon';
import { deepestBandLevel, manifestFor } from './buildSiteGroundHeights';

const RAD_TO_DEG = 180 / Math.PI;
/** Max post index, and the cell count `latticeHeightSample` walks. */
const CELLS = HEIGHT_POSTS_PER_TILE - 1;

const tiles = new Map<string, HeightTile>();

async function tileAt(manifest: SurfaceTileManifest, z: number, x: number, y: number) {
  const rel = surfaceTilePath({ product: 'height', z, x, y }, manifest.prefix);
  const hit = tiles.get(rel);
  if (hit !== undefined) return hit;
  const tile = await readHeightTileFile(resolve(`public/data/images/${rel}`));
  if (tile === null) {
    throw new Error(`reportSiteTerrain: no tile at ${rel} — bake the host's surface first`);
  }
  tiles.set(rel, tile);
  return tile;
}

/** Bilinear height at a lat/lon, off the deepest band's own tile — the same
 *  surface the shader displaces against, not the coarser runtime lattice. */
async function heightAtM(
  manifest: SurfaceTileManifest,
  latDeg: number,
  lonDeg: number,
  z: number,
): Promise<number> {
  const { x, y, colFrac, rowFrac } = tilePostAtLatLon(latDeg, lonDeg, z);
  const { heightM } = await tileAt(manifest, z, x, y);
  const postM = (col: number, row: number): number => {
    const c = Math.min(CELLS, Math.max(0, col));
    const r = Math.min(CELLS, Math.max(0, row));
    return heightM[r * HEIGHT_POSTS_PER_TILE + c]!;
  };
  return latticeHeightSample(postM, [colFrac * CELLS, rowFrac * CELLS], 1, CELLS);
}

export async function reportSiteTerrain(): Promise<void> {
  for (const site of SURFACE_FIXED_SITES) {
    const host = findByIdOrThrow(SCENE_CELESTIAL_BODIES, site.hostId, 'reportSiteTerrain');
    const body = findByIdOrThrow(SCENE_MESH_BODIES, site.id, 'reportSiteTerrain');
    const asset = MESH_ASSETS[body.meshKey];
    if (asset === undefined) {
      throw new Error(`reportSiteTerrain: no MESH_ASSETS entry for '${body.meshKey}'`);
    }
    const manifest = manifestFor(site.hostId);
    const z = deepestBandLevel(manifest, site.latDeg, site.lonDeg);

    // The body's own half-width: the span its contact points actually average
    // the slope over. A one-post baseline would read tile quantisation instead.
    const baselineM = asset.boundingRadiusM;
    const dLat = (baselineM / host.surface.datumRadiusM) * RAD_TO_DEG;
    const dLon = dLat / Math.cos(degToRad(site.latDeg));
    const at = (lat: number, lon: number) => heightAtM(manifest, lat, lon, z);
    const [centreM, northM, southM, eastM, westM] = await Promise.all([
      at(site.latDeg, site.lonDeg),
      at(site.latDeg + dLat, site.lonDeg),
      at(site.latDeg - dLat, site.lonDeg),
      at(site.latDeg, site.lonDeg + dLon),
      at(site.latDeg, site.lonDeg - dLon),
    ]);

    const up = terrainUpEnu(northM, southM, eastM, westM, baselineM);
    const tiltDeg = Math.acos(Math.min(1, up[2])) * RAD_TO_DEG;
    const downhillDeg = (Math.atan2(up[0], up[1]) * RAD_TO_DEG + 360) % 360;
    const { x, y } = tilePostAtLatLon(site.latDeg, site.lonDeg, z);
    const tile = await tileAt(manifest, z, x, y);
    const baked = SITE_GROUND_HEIGHTS[site.id];

    process.stdout.write(
      `${site.id}  (${body.meshKey}, baseline ${baselineM.toFixed(2)} m, z${z})\n` +
        `  height      ${centreM.toFixed(3)} m` +
        `${baked === undefined ? '  (not in SITE_GROUND_HEIGHTS)' : `  drift ${(centreM - baked).toFixed(4)} m`}\n` +
        `  tilt        ${tiltDeg.toFixed(2)}°, downhill ${downhillDeg.toFixed(0)}°\n` +
        `  up (e,n,u)  [${up.map((c) => c.toFixed(4)).join(', ')}]\n` +
        `  across body ${(2 * baselineM * Math.tan(degToRad(tiltDeg)) * 100).toFixed(1)} cm\n` +
        `  tile relief ${(tile.subtreeMaxM - tile.subtreeMinM).toFixed(2)} m\n`,
    );
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  reportSiteTerrain().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
