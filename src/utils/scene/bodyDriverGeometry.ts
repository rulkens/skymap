/**
 * bodyDriverGeometry — the `body` arm's `DriverGeometry`, read off the seed at
 * extract time. A mesh body reports no ground (its radius is a baked hull, not
 * a datum), so the pivot floors on the bounding radius instead; a celestial
 * body's ground is `bodyGroundRadiusAtM`'s (its bounding sphere if mesh-drawn).
 */

import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { findByIdOrThrow } from '../object/findByIdOrThrow';
import { isMeshBody } from '../meshBodies/isMeshBody';
import { bodyFootprintRadiusM } from './bodyFootprintRadiusM';
import { bodyStandoffRadii } from './bodyStandoffRadii';
import { bodyGroundRadiusAtM } from './bodyGroundRadiusAtM';
import type { DriverGeometry } from '../../@types/engine/camera/DriverGeometry';

export function bodyDriverGeometry(bodyId: string): DriverGeometry {
  const body = findByIdOrThrow(SCENE_BODIES, bodyId, 'bodyDriverGeometry');
  const footprintRadiusM = bodyFootprintRadiusM(body);
  return {
    poseId: body.id,
    boundingRadiusM: footprintRadiusM,
    footprintRadiusM,
    groundRadiusM: isMeshBody(body) ? null : bodyGroundRadiusAtM(body, 0),
    standoffRadii: bodyStandoffRadii(body),
  };
}
