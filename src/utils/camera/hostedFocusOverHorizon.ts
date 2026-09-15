/**
 * Has a focus hosted on this body sunk below the eye's horizon? `dot(E − P, P)`
 * in body-fixed metres, `P` the focus's site point — negative once the tangent
 * plane at `P` has the eye behind it. `E` is lifted to the descent floor first
 * (`flooredBodyPose`'s radial push): a follow approach parks the eye metres
 * UNDER the datum, and a horizon judged from underground refuses everything.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { HostBody } from '../../@types/camera/HostBody';
import type { Vec3 } from '../../@types/math/Vec3';
import { hostedFocusPivotM } from './hostedFocusPivotM';
import { surfaceFloorM } from './surfaceFloorM';

export function hostedFocusOverHorizon(
  eyeM: Readonly<Vec3>,
  focusBodyId: BodyId | null,
  host: HostBody,
): boolean {
  const p = hostedFocusPivotM(focusBodyId, host.id, host.radiusM);
  if (p === null) return false;
  const magM = Math.hypot(eyeM[0], eyeM[1], eyeM[2]);
  const floorM = surfaceFloorM(host.radiusM, host.standoffRadii);
  const lift = magM >= floorM || magM === 0 ? 1 : floorM / magM;
  return (
    (eyeM[0] * lift - p[0]) * p[0] +
      (eyeM[1] * lift - p[1]) * p[1] +
      (eyeM[2] * lift - p[2]) * p[2] <=
    0
  );
}
