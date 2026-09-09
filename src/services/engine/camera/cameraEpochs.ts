/**
 * cameraEpochs — pure Epoch primitives beside the mutable `cameraClock.ts`:
 * `advanceEpoch` resets on ref-identity change, `elapsedMs` reads since.
 */

import type { Epoch } from '../../../@types/engine/camera/Epoch';

/** Same `ref` ⇒ `prev` back BY IDENTITY (no allocation) — the no-op guard callers rely on. */
export function advanceEpoch<Ref>(prev: Epoch<Ref>, ref: Ref | null, nowMs: number): Epoch<Ref> {
  if (ref === prev.ref) return prev;
  return { ref, startMs: ref === null ? null : nowMs };
}

export function elapsedMs<Ref>(epoch: Epoch<Ref>, nowMs: number): number {
  return epoch.startMs === null ? 0 : nowMs - epoch.startMs;
}
