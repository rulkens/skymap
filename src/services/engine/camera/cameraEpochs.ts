/** cameraEpochs — pure Epoch primitives beside the mutable `cameraClock.ts`. */

import type { Epoch } from '../../../@types/engine/camera/Epoch';
import type { CameraEpochs } from '../../../@types/engine/camera/CameraEpochs';
import type { CameraState } from '../../../@types/camera/CameraState';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

/** Same `ref` ⇒ `prev` back BY IDENTITY — the no-op guard callers key on. */
export function advanceEpoch<Ref>(prev: Epoch<Ref>, ref: Ref | null, nowMs: number): Epoch<Ref> {
  if (ref === prev.ref) return prev;
  return { ref, startMs: ref === null ? null : nowMs };
}

export function elapsedMs<Ref>(epoch: Epoch<Ref>, nowMs: number): number {
  return epoch.startMs === null ? 0 : nowMs - epoch.startMs;
}

/**
 * Advances the five rows in one call. `tween`/`autoRotate`/`follow` read
 * their live ref only when their driver wins this frame (else the ease would
 * burn while some other driver, e.g. a drag, holds) — replaying `prev.ref`
 * when ineligible makes `advanceEpoch` a guaranteed no-op for that row.
 * `frameTween` has no eligibility gate: `resolveFrameBasis` reads it
 * regardless of winner. `clip` is not advanced here at all — the clip player
 * advances it before the frame step runs, so it is passed through by reference.
 */
export function advanceEpochs(
  prev: CameraEpochs,
  inputs: {
    readonly intent: CameraState;
    readonly focus: SelectionRow | null;
    readonly clip: Epoch<NonNullable<CameraState['clip']>>;
    readonly winnerId: string;
    readonly nowMs: number;
  },
): CameraEpochs {
  const { intent, focus, clip, winnerId, nowMs } = inputs;

  // One eligibility fact per row, minus the two rows that don't need one.
  // A later follow id is a one-cell edit to this literal.
  const eligible = {
    tween: winnerId === 'tween',
    autoRotate: winnerId === 'autoRotate',
    follow: winnerId === 'followBody',
  };

  const tween = advanceEpoch(prev.tween, eligible.tween ? intent.tween : prev.tween.ref, nowMs);
  const autoRotate = advanceEpoch(
    prev.autoRotate,
    eligible.autoRotate ? (intent.autoRotate.active ? intent.base : null) : prev.autoRotate.ref,
    nowMs,
  );
  const follow = advanceEpoch(prev.follow, eligible.follow ? focus : prev.follow.ref, nowMs);
  const frameTween = advanceEpoch(prev.frameTween, intent.frameTween, nowMs);

  if (
    tween === prev.tween &&
    autoRotate === prev.autoRotate &&
    follow === prev.follow &&
    frameTween === prev.frameTween &&
    clip === prev.clip
  ) {
    return prev;
  }
  return { tween, autoRotate, follow, frameTween, clip };
}
