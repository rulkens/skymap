/**
 * trackBody — keep a moving body at the orbit target while a `clock` cue runs
 * the sim clock: one linear `moveTarget` leg per `stepSec`, each ending on the
 * body's position at the instant the clock will read then. With `faceToward`,
 * a concurrent `aimAt` per leg keeps a second body behind the first (a chase cam).
 *
 * Place it in the same beat as its `clock` cue, so the two share a zero point;
 * the cue stamps its table at fire time, at most a frame off the clip clock.
 */

import type { ClockKey } from '../../../../@types/animation/ClockKey';
import type { Effect } from '../../../../@types/animation/Effect';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { aimAt, all, moveTarget, seq } from '../../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../../services/engine/frame/deriveBodyStates';
import { interpolateClockProfile } from '../../../../utils/time/interpolateClockProfile';
import { orbitAnglesLookingAlong } from '../../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { normalize3 } from '../../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../../orientation/orientationFrames';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';

export function trackBody(
  bodyId: SceneBodyId,
  keys: readonly ClockKey[],
  stepSec: number,
  faceToward?: { bodyId: SceneBodyId; elevationRad: number },
): Effect {
  const profile = {
    startWallMs: 0,
    wallMs: Float64Array.from(keys, (k) => k.sec * 1000),
    simDays: Float64Array.from(keys, (k) => k.simDays),
  };
  const endSec = keys[keys.length - 1]!.sec;
  const legs: Effect[] = [];
  for (let t = stepSec; t <= endSec + 1e-9; t += stepSec) {
    const bodies = deriveBodyStates(interpolateClockProfile(profile, t * 1000));
    const p = bodies.get(bodyId)!.positionMpc;
    const to: Vec3 = [p[0], p[1], p[2]];
    if (!faceToward) {
      legs.push(moveTarget(to, stepSec, 'linear'));
      continue;
    }
    const q = bodies.get(faceToward.bodyId)!.positionMpc;
    const bearing = orbitAnglesLookingAlong(
      normalize3([q[0] - p[0], q[1] - p[1], q[2] - p[2]]),
      ORIENTATION_FRAMES.ecliptic,
    );
    legs.push(
      all([
        moveTarget(to, stepSec, 'linear'),
        aimAt({ yaw: bearing.yaw, pitch: bearing.pitch + faceToward.elevationRad }, stepSec, 'linear'),
      ]),
    );
  }
  return seq(legs);
}
