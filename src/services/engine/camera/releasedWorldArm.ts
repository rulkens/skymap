/**
 * releasedWorldArm — the world arm a hand-back from `framed` would land on: the
 * fold, with the up authority a disengage applies (`releasedWorldRoll`, ruling
 * 11). The world arm answers BY REFERENCE, so a reader already there is
 * unchanged bit for bit. The follow rows ease toward this, not the raw fold: an
 * arm's roll is its local horizon, which no world-arm reader reclaims.
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraTuning } from '../../../@types/camera/CameraTuning';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { RungBasisCtx } from '../../../@types/camera/RungBasisCtx';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { releasedWorldRoll } from '../../../utils/camera/releasedWorldRoll';
import { hOverR } from './hOverR';
import { foldToWorld } from './rungs/foldToWorld';
import { hostOf } from './rungs/hostOf';
import { isWorldArm } from './rungs/isWorldArm';

export function releasedWorldArm(
  framed: FramedCameraPose,
  ctx: RungBasisCtx,
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
