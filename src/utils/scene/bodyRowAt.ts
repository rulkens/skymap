import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { findByIdOrThrow } from '../object/findByIdOrThrow';
import { bodyDriverGeometry } from './bodyDriverGeometry';
import { footprintRadiusMpc } from '../selection/footprintRadiusMpc';
import type { Vec3 } from '../../@types/math/Vec3';
import type { BodySelectionRow } from '../../@types/engine/selection/BodySelectionRow';

/** A scene body's selection row at a position the caller already derived. */
export function bodyRowAt(bodyId: string, positionMpc: Vec3): BodySelectionRow {
  const body = findByIdOrThrow(SCENE_BODIES, bodyId, 'bodyRowAt');
  const driver = bodyDriverGeometry(body.id);
  return {
    type: 'body',
    id: body.id,
    label: body.label,
    positionMpc: [positionMpc[0], positionMpc[1], positionMpc[2]],
    radiusMpc: footprintRadiusMpc(driver),
    driver,
  };
}
