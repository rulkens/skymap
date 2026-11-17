/**
 * releasedWorldArm — the world arm a hand-back from `framed` would land on: the
 * fold, with the up authority a disengage applies (`releasedWorldRoll`, ruling
 * 11). The world arm answers BY REFERENCE, so a reader already there is
 * unchanged bit for bit. The follow rows ease toward this, not the raw fold: an
 * arm's roll is its local horizon, which no world-arm reader reclaims.
 */

import type { CameraPose } from '../../../../../@types/camera/pose/CameraPose';
import type { CameraTuning } from '../../../../../@types/camera/orbitCamera/CameraTuning';
import type { FramedCameraPose } from '../../../../../@types/camera/pose/FramedCameraPose';
import type { CameraArmBasisCtx } from '../../../../../@types/camera/arms/CameraArmBasisCtx';
import { eyeMpcOf } from '../../../../../utils/camera/orbitPose/eyeMpcOf';
import { releasedWorldRoll } from '../../../../../utils/camera/arms/releasedWorldRoll';
import { hOverR } from '../../bodyFrame/hOverR';
import { foldToWorld } from '../foldToWorld';
import { hostOf } from '../hostOf';
import { isWorldArm } from './isWorldArm';

export function releasedWorldArm(
  framed: FramedCameraPose,
  ctx: CameraArmBasisCtx,
  tuning: CameraTuning,
): CameraPose {
  if (isWorldArm(framed)) return framed.pose;
  const world = foldToWorld(framed, ctx);
  const host = hostOf(framed.frame, ctx);
  if (host === null) return world;
  const roll = releasedWorldRoll(
    world.roll ?? 0,
    hOverR(eyeMpcOf(world, ctx.poseBasis), host.state, host.radiusM),
    tuning,
  );
  return roll === (world.roll ?? 0) ? world : { ...world, roll };
}
