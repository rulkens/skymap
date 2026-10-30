/**
 * sceneBodyStates — THE per-frame map of every scene body's time-varying `BodyState`, keyed by
 * id: the frame context's `bodyStates`, which `runFrame` derived once at `ctx.snapshot.simDays`
 * and placed the moving selection in (`frameBodyStates`). Per-frame consumers read this and never
 * call `deriveBodyStates` with an epoch of their own: two Layers picking two instants would draw
 * the same body at two positions, and a followed satellite is only in this map.
 *
 * `state` is unread; the parameter keeps signature parity with `sceneBodyPartition`.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { BodyState } from '../../../@types/scene/BodyState';

export function sceneBodyStates(state: PassState, ctx: FrameView): ReadonlyMap<string, BodyState> {
  return ctx.snapshot.bodyStates;
}
