/**
 * reportSiteTerrain — read-only survey of the ground under every
 * `SURFACE_FIXED_SITES` row: the committed height's and up's drift against
 * today's tiles, the slope, and the tile's relief. Writes nothing.
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  SITE_GROUND_HEIGHTS,
  SITE_GROUND_UPS_ENU,
} from '../../src/data/bodies/siteGroundHeights.generated';
import { SURFACE_FIXED_SITES } from '../../src/data/bodies/surfaceFixedSites';
import { surfaceTilePath } from '../../src/utils/surfaceTiles/surfaceTilePath';
import { readHeightTileFile } from '../utils/textures/readHeightTileFile';
import { tilePostAtLatLon } from '../utils/textures/tilePostAtLatLon';
import {
  deepestBandLevel,
  manifestFor,
  siteGroundHeightM,
  siteGroundUpEnu,
} from './buildSiteGroundHeights';

const RAD_TO_DEG = 180 / Math.PI;

export async function reportSiteTerrain(): Promise<void> {
  for (const site of SURFACE_FIXED_SITES) {
    const manifest = manifestFor(site.hostId);
    const z = deepestBandLevel(manifest, site.latDeg, site.lonDeg);
    const heightM = await siteGroundHeightM(site, manifest);
    const up = await siteGroundUpEnu(site, manifest);
    const tiltDeg = Math.acos(Math.min(1, up[2])) * RAD_TO_DEG;
    const downhillDeg = (Math.atan2(up[0], up[1]) * RAD_TO_DEG + 360) % 360;

    const { x, y } = tilePostAtLatLon(site.latDeg, site.lonDeg, z);
    const rel = surfaceTilePath({ product: 'height', z, x, y }, manifest.prefix);
    const tile = await readHeightTileFile(resolve(`public/data/images/${rel}`));
    if (tile === null) throw new Error(`reportSiteTerrain: no tile at ${rel}`);

    const bakedM = SITE_GROUND_HEIGHTS[site.id];
    const bakedUp = SITE_GROUND_UPS_ENU[site.id];
    const upDriftDeg =
      bakedUp === undefined
        ? undefined
        : Math.acos(Math.min(1, up[0] * bakedUp[0] + up[1] * bakedUp[1] + up[2] * bakedUp[2])) *
          RAD_TO_DEG;

    process.stdout.write(
      `${site.id}  (z${z})\n` +
        `  height      ${heightM.toFixed(3)} m` +
        `${bakedM === undefined ? '  (not baked)' : `  drift ${(heightM - bakedM).toFixed(4)} m`}\n` +
        `  tilt        ${tiltDeg.toFixed(2)}°, downhill ${downhillDeg.toFixed(0)}°` +
        `${upDriftDeg === undefined ? '  (not baked)' : `  drift ${upDriftDeg.toFixed(3)}°`}\n` +
        `  up (e,n,u)  [${up.map((c) => c.toFixed(4)).join(', ')}]\n` +
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
