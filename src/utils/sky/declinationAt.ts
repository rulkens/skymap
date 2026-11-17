/** declinationAt — a world-frame target's declination against a host's equator (radians). */

import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import type { Vec3 } from '../../@types/math/Vec3';
import type { PositionedId } from '../../@types/scene/PositionedId';
import type { BodyState } from '../../@types/scene/BodyState';
import { altAzFromSpot } from './altAzFromSpot';

export function declinationAt(
  body: SceneBodyId,
  targetWorldMpc: Readonly<Vec3>,
  bodies: ReadonlyMap<PositionedId, BodyState>,
): number {
  // Seen from the host's north pole, a target's altitude is its declination.
  const pole = { body, lonRad: 0, latRad: Math.PI / 2 };
  return altAzFromSpot(pole, targetWorldMpc, bodies).altitudeRad;
}
