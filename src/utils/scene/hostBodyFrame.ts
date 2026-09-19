/**
 * hostBodyFrame — resolve a body-m row's host `BodyState` and camera pose
 * once, so `meshBodiesPass` and `contactShadowsPass` (and any future body-m
 * pass) share one derivation instead of re-deriving it and risking drift.
 * Null ⇒ this host has no state or pose this frame (culled) — the caller
 * draws nothing.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { HostBodyFrame } from '../../@types/scene/HostBodyFrame';
import { sceneBodyStates } from '../../services/engine/frame/sceneBodyStates';

export function hostBodyFrame(
  state: PassState,
  ctx: ReadyFrameContext,
  hostId: BodyId,
): HostBodyFrame | null {
  const bodyStates = sceneBodyStates(state, ctx);
  const hostState = bodyStates.get(hostId);
  if (hostState === undefined) return null;
  const hostPose = ctx.bodyPose(hostId);
  if (hostPose === null) return null;
  return { bodyStates, hostState, hostPose };
}
