/**
 * hostFacingPose — a moon framed from its host: the eye on the host's side, looking
 * along host → moon. A synchronous moon keeps its host-facing hemisphere there, so a
 * link that names the moon lands on the face its host sees, at any phase. A body
 * orbiting the Sun has no such face and gets null (it keeps the carried-over view).
 */

import { deriveBodyStates } from '../../frame/deriveBodyStates';
import { bodyRowAt } from '../../../../utils/scene/bodyRowAt';
import { arrivalFraming } from './arrivalFraming';
import { BODY_FOCUS } from '../../../../data/selection/bodyFocus';
import { bodyHostId, positionDriverOrNull } from '../../../../data/bodies/positionDrivers';
import { orbitAnglesLookingAlong } from '../../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { normalize3 } from '../../../../utils/math/normalize3';
import type { CameraPose } from '../../../../@types/camera/pose/CameraPose';
import type { Mat3 } from '../../../../@types/math/Mat3';

export function hostFacingPose(
  bodyId: string,
  simDays: number,
  fovYRad: number,
  frameBasis?: Mat3,
): CameraPose | null {
  if (positionDriverOrNull(bodyId)?.kind !== 'orbit') return null;
  const hostId = bodyHostId(bodyId);
  if (hostId === null || hostId === 'sun') return null;
  const states = deriveBodyStates(simDays);
  const body = states.get(bodyId as never)?.positionMpc;
  const host = states.get(hostId as never)?.positionMpc;
  if (!body || !host) return null;
  const { target, distance } = arrivalFraming(bodyRowAt(bodyId, body), BODY_FOCUS, fovYRad);
  const aim = normalize3([body[0] - host[0], body[1] - host[1], body[2] - host[2]]);
  return { target, distance, ...orbitAnglesLookingAlong(aim, frameBasis) };
}
