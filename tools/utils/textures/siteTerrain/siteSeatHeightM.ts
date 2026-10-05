import type { GroundSample } from '../../../textures/@types/GroundSample';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { SurfaceFixedSite } from '../../../../src/@types/scene/SurfaceFixedSite';
import type { SurfaceTileManifest } from '../../../../src/@types/scene/SurfaceTileManifest';
import { SCENE_CELESTIAL_BODIES } from '../../../../src/data/bodies/sceneCelestialBodies';
import { degToRad } from '../../../../src/utils/math/degToRad';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';
import { deepestBandLevel } from './deepestBandLevel';
import { readGroundHeightM } from './readGroundHeightM';
import { seatHeightM } from './seatHeightM';
import { siteFootprintRadiusM } from './siteFootprintRadiusM';

const RAD_TO_DEG = 180 / Math.PI;
/** Far finer than a z17 Mars vertex (~2.6 m), so a crest between two grid
 *  points costs at most slope × step/2 — millimetres. */
const GRID_STEP_M = 0.05;

/** siteSeatHeightM — the ground height, metres above the datum, that seats
 *  `site`'s posed body on the drawn ground across its footprint disc. */
export async function siteSeatHeightM(
  site: SurfaceFixedSite,
  manifest: SurfaceTileManifest,
  upEnu: Readonly<Vec3>,
): Promise<number> {
  const host = findByIdOrThrow(SCENE_CELESTIAL_BODIES, site.hostId, 'siteSeatHeightM');
  const radiusM = siteFootprintRadiusM(site);
  const z = deepestBandLevel(manifest, site.latDeg, site.lonDeg);
  const degPerM = RAD_TO_DEG / host.surface.datumRadiusM;
  const lonScale = 1 / Math.cos(degToRad(site.latDeg));

  const steps = Math.ceil(radiusM / GRID_STEP_M);
  const offsets: [number, number][] = [];
  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      const eastM = i * GRID_STEP_M;
      const northM = j * GRID_STEP_M;
      if (eastM * eastM + northM * northM <= radiusM * radiusM) offsets.push([eastM, northM]);
    }
  }
  const samples: GroundSample[] = await Promise.all(
    offsets.map(async ([eastM, northM]) => ({
      eastM,
      northM,
      heightM: await readGroundHeightM(
        manifest,
        site.latDeg + northM * degPerM,
        site.lonDeg + eastM * degPerM * lonScale,
        z,
      ),
    })),
  );
  return seatHeightM(samples, upEnu, site.altitudeM);
}
