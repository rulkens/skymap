/**
 * The ladder's single thrower. A rung is only ever entered for a body the
 * roster resolved, so an unresolved host is unreachable by construction and a
 * silent fallback would teleport the camera.
 */

import type { HostBody } from '../../../../@types/camera/HostBody';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungBasisCtx } from '../../../../@types/camera/RungBasisCtx';
import { frameKey } from './frameKey';
import { hostOf } from './hostOf';

export function hostOrThrow(frame: PoseFrame, ctx: RungBasisCtx): HostBody {
  const host = hostOf(frame, ctx);
  if (host === null) {
    throw new Error(`hostOrThrow: frame '${frameKey(frame)}' is unresolved this instant`);
  }
  return host;
}
