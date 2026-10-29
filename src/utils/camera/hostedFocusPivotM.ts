/**
 * The point a HOSTED focus pins its host's arm to — a rover on its planet — in
 * the host's body-fixed metres, or null where the focus IS the host (or absent)
 * and the arm holds nothing. Derived from the focus every frame rather than
 * carried in the pose: a carried anchor decouples from the rover the moment a
 * drag turns the arm rigidly.
 */

import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import type { Vec3 } from '../../@types/math/Vec3';
import { positionDriverOrNull } from '../../data/bodies/positionDrivers';
import { siteGroundRadiusM } from './siteGroundRadiusM';
import { sitePointBodyFixed } from './sitePointBodyFixed';
import type { PositionedId } from '../../@types/scene/PositionedId';

export function hostedFocusPivotM(
  focusBodyId: PositionedId | null,
  hostId: SceneBodyId,
  hostRadiusM: number,
): Vec3 | null {
  if (focusBodyId === null || focusBodyId === hostId) return null;
  const driver = positionDriverOrNull(focusBodyId);
  return driver?.kind === 'surfaceFixed' && driver.hostId === hostId
    ? sitePointBodyFixed(driver, siteGroundRadiusM(driver, hostRadiusM))
    : null;
}
