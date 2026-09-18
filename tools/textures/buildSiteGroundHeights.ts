/**
 * buildSiteGroundHeights — bakes each `SURFACE_FIXED_SITES` row's ground
 * height (metres above its host's datum) and ground up vector from the deepest
 * baked height tile under its lat/lon, into `siteGroundHeights.generated.ts`.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Vec3 } from '../../src/@types/math/Vec3';
import { SURFACE_FIXED_SITES } from '../../src/data/bodies/surfaceFixedSites';
import { readSurfaceTileManifest } from '../utils/textures/siteTerrain/readSurfaceTileManifest';
import { siteGroundHeightM } from '../utils/textures/siteTerrain/siteGroundHeightM';
import { siteGroundUpEnu } from '../utils/textures/siteTerrain/siteGroundUpEnu';

const RAD_TO_DEG = 180 / Math.PI;

const GENERATED_BANNER =
  '// src/data/bodies/siteGroundHeights.generated.ts\n' +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run build-site-ground-heights (also runs at the end\n' +
  '// of a non-dev Mars tile bake)\n' +
  "// Source of truth:  the host's own baked height tiles\n";

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
    const manifest = readSurfaceTileManifest(site.hostId);
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
