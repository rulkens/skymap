/**
 * bodyDriverGeometry — the `body` arm's `DriverGeometry`, read off the seed at
 * extract time. A mesh body reports no ground (its radius is a baked hull, not
 * a datum), so the pivot floors on the bounding radius instead; for a celestial
 * body the two radii coincide at the outer bound `bodyFootprintRadiusM` gives.
 */

import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { findByIdOrThrow } from '../object/findByIdOrThrow';
import { isMeshBody } from '../meshBodies/isMeshBody';
import { bodyFootprintRadiusM } from './bodyFootprintRadiusM';
import { bodyStandoffRadii } from './bodyStandoffRadii';
import type { DriverGeometry } from '../../@types/engine/camera/DriverGeometry';

export function bodyDriverGeometry(bodyId: string): DriverGeometry {
  const body = findByIdOrThrow(SCENE_BODIES, bodyId, 'bodyDriverGeometry');
  const footprintRadiusM = bodyFootprintRadiusM(body);
  return {
    poseId: body.id,
    boundingRadiusM: footprintRadiusM,
    footprintRadiusM,
    groundRadiusM: isMeshBody(body) ? null : body.surface.datumRadiusM,
    standoffRadii: bodyStandoffRadii(body),
    // An absent arrival override stays absent — no `focusDistanceRadii: undefined` key.
    ...('focusDistanceRadii' in body && body.focusDistanceRadii !== undefined
      ? { focusDistanceRadii: body.focusDistanceRadii }
      : {}),
  };
}
