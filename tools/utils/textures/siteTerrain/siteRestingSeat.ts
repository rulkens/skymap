import type { SiteSeat } from '../../../textures/@types/SiteSeat';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { SurfaceFixedSite } from '../../../../src/@types/scene/SurfaceFixedSite';
import type { SurfaceTileManifest } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifest';
import { rotationRowById } from '../../../../src/data/bodies/rotationElements';
import { SCENE_CELESTIAL_BODIES } from '../../../../src/data/bodies/sceneCelestialBodies';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { degToRad } from '../../../../src/utils/math/degToRad';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';
import { rotationSurfaceLocked } from '../../../../src/utils/orbit/rotationSurfaceLocked';
import { meshContactPointsM } from '../../meshes/meshContactPointsM';
import { contactPlaneSeat } from './contactPlaneSeat';
import { deepestBandLevel } from './deepestBandLevel';
import { readGroundHeightM } from './readGroundHeightM';
import { siteGroundUpEnu } from './siteGroundUpEnu';
import { siteSeatHeightM } from './siteSeatHeightM';

const RAD_TO_DEG = 180 / Math.PI;
/** Where the contacts land depends on the tilt being fitted (a 0.9 m lift on a
 *  9° slope swings them ~14 cm), so place, fit, re-place: converged to µm by the third. */
const PLACEMENT_PASSES = 3;

/**
 * siteRestingSeat — a `resting` site's seat: the plane through the drawn
 * ground under its mesh's contact points, placed as `rotationSurfaceLocked`
 * poses them, so height and tilt share one footprint. A body with no
 * surface-locked pose or under three non-collinear contacts (a probe sphere)
 * keeps the footprint rule: highest ground over its bounding disc, footprint up.
 */
export async function siteRestingSeat(
  site: SurfaceFixedSite,
  manifest: SurfaceTileManifest,
): Promise<SiteSeat> {
  const host = findByIdOrThrow(SCENE_CELESTIAL_BODIES, site.hostId, 'siteRestingSeat');
  const body = findByIdOrThrow(SCENE_MESH_BODIES, site.id, 'siteRestingSeat');
  const z = deepestBandLevel(manifest, site.latDeg, site.lonDeg);
  const degPerM = RAD_TO_DEG / host.surface.datumRadiusM;
  const lonScale = 1 / Math.cos(degToRad(site.latDeg));
  const groundM = (eastM: number, northM: number) =>
    readGroundHeightM(
      manifest,
      site.latDeg + northM * degPerM,
      site.lonDeg + eastM * degPerM * lonScale,
      z,
    );

  // Without a surface-locked pose the mesh's -Z is not the ground's down.
  const row = rotationRowById(site.id);
  const pose = row?.kind === 'surfaceLocked' ? row : null;
  let contacts: Vec3[] = [];
  if (pose !== null) {
    if (body.tierCeiling === undefined) {
      throw new Error(`siteRestingSeat: '${site.id}' has no baked mesh to find its contacts in`);
    }
    contacts = await meshContactPointsM(body.meshKey, body.tierCeiling);
  }
  const latRad = degToRad(site.latDeg);
  const poleEnu: Vec3 = [0, Math.cos(latRad), Math.sin(latRad)];
  const placed = (up: Readonly<Vec3>): Vec3[] => {
    if (pose === null) return [];
    // The site's ENU frame: radial [0, 0, 1], so the pose comes out in (east, north, up).
    const frame = rotationSurfaceLocked([0, 0, 1], [0, 0, 0], poleEnu, pose.headingDeg, up);
    return contacts.map((p) => rotateVec3ByTightMat3(frame, [...p]));
  };

  const footprintUp = await siteGroundUpEnu(site, manifest);
  let up = footprintUp;
  let seat: SiteSeat | null = null;
  for (let pass = 0; pass < PLACEMENT_PASSES; pass++) {
    const at = placed(up);
    // A foot whose lowest point sits above the mesh's bottom touches that much lower ground.
    const samples = await Promise.all(
      at.map(async ([eastM, northM], i) => ({
        eastM,
        northM,
        heightM: (await groundM(eastM, northM)) - (contacts[i]![2] + site.altitudeM),
      })),
    );
    seat = contactPlaneSeat(samples, site.altitudeM);
    if (seat === null) {
      process.stderr.write(
        `  ${site.id}: ${contacts.length} contact(s), too few for a plane — old footprint seat\n`,
      );
      return { heightM: await siteSeatHeightM(site, manifest, footprintUp), up: footprintUp };
    }
    up = seat.up;
  }
  return seat!;
}
