import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { findByIdOrThrow } from '../object/findByIdOrThrow';
import { bodyDriverGeometry } from './bodyDriverGeometry';
import { footprintRadiusMpc } from '../selection/footprintRadiusMpc';
import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { Vec3 } from '../../@types/math/Vec3';

/** A scene body's selection row at a position the caller already derived. */
export function bodyRowAt(
  bodyId: string,
  positionMpc: Vec3,
): Extract<SelectionRow, { type: 'body' }> {
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
