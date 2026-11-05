/**
 * The arm tree's single thrower. An arm is only ever entered for a body the
 * roster resolved, so an unresolved host is unreachable by construction and a
 * silent fallback would teleport the camera.
 */

import type { HostBody } from './@types/HostBody';
import type { PoseFrame } from '../../../../@types/camera/pose/PoseFrame';
import type { CameraArmBasisCtx } from '../../../../@types/camera/arms/CameraArmBasisCtx';
import { frameKey } from './frameKey';
import { hostOf } from './hostOf';

export function hostOrThrow(frame: PoseFrame, ctx: CameraArmBasisCtx): HostBody {
  const host = hostOf(frame, ctx);
  if (host === null) {
    throw new Error(`hostOrThrow: frame '${frameKey(frame)}' is unresolved this instant`);
  }
  return host;
}
