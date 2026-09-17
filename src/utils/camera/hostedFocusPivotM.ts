/**
 * The point a HOSTED focus pins its host's arm to — a rover on its planet — in
 * the host's body-fixed metres, or null where the focus IS the host (or absent)
 * and the arm holds nothing. Derived from the focus every frame rather than
 * carried in the pose: a carried anchor decouples from the rover the moment a
 * drag turns the arm rigidly.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { GroundRadiusLookup } from '../../@types/camera/GroundRadiusLookup';
import type { Vec3 } from '../../@types/math/Vec3';
import { positionDriverById } from '../../data/bodies/positionDrivers';
import { sitePointBodyFixed } from './sitePointBodyFixed';

export function hostedFocusPivotM(
  focusBodyId: BodyId | null,
  hostId: BodyId,
  groundRadiusAtM: GroundRadiusLookup,
): Vec3 | null {
  if (focusBodyId === null || focusBodyId === hostId) return null;
  const driver = positionDriverById(focusBodyId);
  return driver.kind === 'surfaceFixed' && driver.hostId === hostId
    ? sitePointBodyFixed(driver, groundRadiusAtM)
    : null;
}
