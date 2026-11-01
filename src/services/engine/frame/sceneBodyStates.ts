/**
 * sceneBodyStates — THE per-frame body map, keyed by id: the frame context's `bodyStates`.
 * Per-frame consumers read this and never call `deriveBodyStates` at an epoch of their own, or
 * two Layers could draw one body at two positions. `state` is unread (parity with `sceneBodyPartition`).
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { BodyState } from '../../../@types/scene/BodyState';

export function sceneBodyStates(state: PassState, ctx: FrameView): ReadonlyMap<string, BodyState> {
  return ctx.snapshot.bodyStates;
}
