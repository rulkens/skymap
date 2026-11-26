/** spotWorldMpc — a spot's point on its host's datum sphere, in world Mpc: where a standing eye looks from. */

import type { BodyState } from '../../@types/scene/BodyState';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import { SCENE_CELESTIAL_BODIES } from '../../data/bodies/sceneCelestialBodies';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { findByIdOrThrow } from '../object/findByIdOrThrow';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { skySpotRadial } from '../geo/skySpotRadial';

export function spotWorldMpc(spot: SkySpot, host: BodyState): Vec3 {
  const radiusMpc =
    findByIdOrThrow(SCENE_CELESTIAL_BODIES, spot.body, 'spotWorldMpc').surface.datumRadiusM *
    SCALE_UNITS.M_TO_MPC;
  const radial = rotateVec3ByTightMat3(host.orientation, skySpotRadial(spot));
  return [
    host.positionMpc[0] + radial[0] * radiusMpc,
    host.positionMpc[1] + radial[1] * radiusMpc,
    host.positionMpc[2] + radial[2] * radiusMpc,
  ];
}
