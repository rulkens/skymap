/**
 * buildSiteGroundHeights — bakes each `SURFACE_FIXED_SITES` row's ground up
 * vector and seat height (metres above its host's datum) into
 * `siteGroundHeights.generated.ts`. A `resting` site reads it from the
 * deepest baked height tile under it; an `anchored` site already carries its
 * own real-world height and needs no terrain sample — see `anchoredSeat`.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GeodeticAnchor } from '../../src/@types/geo/GeodeticAnchor';
import type { SurfaceFixedSite } from '../../src/@types/scene/SurfaceFixedSite';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { SCENE_CELESTIAL_BODIES } from '../../src/data/bodies/sceneCelestialBodies';
import { SCENE_MESH_BODIES } from '../../src/data/bodies/sceneMeshBodies';
import { SURFACE_FIXED_SITES } from '../../src/data/bodies/surfaceFixedSites';
import { normalize3 } from '../../src/utils/math/normalize3';
import { findByIdOrThrow } from '../../src/utils/object/findByIdOrThrow';
import { enuOffsetM } from '../utils/geo/enuOffsetM';
import { MESH_SOURCES } from '../utils/io/meshSources';
import { readSurfaceTileManifest } from '../utils/textures/siteTerrain/readSurfaceTileManifest';
import { siteGroundUpEnu } from '../utils/textures/siteTerrain/siteGroundUpEnu';
import { siteSeatHeightM } from '../utils/textures/siteTerrain/siteSeatHeightM';

const RAD_TO_DEG = 180 / Math.PI;

/** The `GeodeticAnchor` an `anchored` site's own mesh source carries, joined
 *  through `SCENE_MESH_BODIES` the same direction `meshAnchorSite` joins the
 *  other way (key -> site). */
function anchorForSite(site: SurfaceFixedSite): GeodeticAnchor {
  const body = SCENE_MESH_BODIES.find((b) => b.id === site.id);
  const anchor = body && MESH_SOURCES[body.meshKey]?.georeferenced?.anchor;
  if (anchor === undefined) {
    throw new Error(
      `buildSiteGroundHeights: anchored site '${site.id}' has no georeferenced mesh source`,
    );
  }
  return anchor;
}

/**
 * anchoredSeat — an anchored site's height and up with NO terrain sample:
 * height is the source anchor's own DVR90 height; up is the anchor's own
 * straight-up as seen from the site, which tilts a hair off true vertical
 * because the site sits `enuOffsetM(anchor, site)` away from where that
 * "straight up" was measured. Exported standalone (no manifest argument) so
 * it is testable with no baked tiles on disk.
 */
export function anchoredSeat(
  site: SurfaceFixedSite,
  anchor: GeodeticAnchor,
  radiusM: number,
): { readonly heightM: number; readonly up: Vec3 } {
  const [e, n] = enuOffsetM(anchor, site, radiusM);
  return { heightM: anchor.heightM, up: normalize3([-e / radiusM, -n / radiusM, 1]) };
}

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
    "/** Site id -> ground height, metres above the host's datum, the posed body\n" +
    ' *  is seated at: resting on the highest drawn ground under its footprint\n' +
    ' *  (see the generator). */\n' +
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
    let m: number;
    let up: Vec3;
    if (site.seat === 'anchored') {
      const host = findByIdOrThrow(SCENE_CELESTIAL_BODIES, site.hostId, 'buildSiteGroundHeights');
      ({ heightM: m, up } = anchoredSeat(site, anchorForSite(site), host.surface.datumRadiusM));
    } else {
      const manifest = readSurfaceTileManifest(site.hostId);
      up = await siteGroundUpEnu(site, manifest);
      m = await siteSeatHeightM(site, manifest, up);
    }
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
