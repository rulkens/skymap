/** cameraEpochs — pure Epoch primitives beside the mutable `cameraClock.ts`. */

import type { Epoch } from '../../../@types/engine/camera/Epoch';

/** Same `ref` ⇒ `prev` back BY IDENTITY — the no-op guard callers key on. */
export function advanceEpoch<Ref>(prev: Epoch<Ref>, ref: Ref | null, nowMs: number): Epoch<Ref> {
  if (ref === prev.ref) return prev;
  return { ref, startMs: ref === null ? null : nowMs };
}

export function elapsedMs<Ref>(epoch: Epoch<Ref>, nowMs: number): number {
  return epoch.startMs === null ? 0 : nowMs - epoch.startMs;
}
