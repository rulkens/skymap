import type { ClipSpan } from '../../../../../src/@types/animation/ClipSpan';

/** Where Play starts: the loop's start when the head is outside it, 0 at or past End, else the head. */
export function playFrom(head: number, durationSec: number, loop: ClipSpan | null): number {
  if (loop !== null && (head < loop.startSec || head >= loop.endSec)) return loop.startSec;
  return head >= durationSec ? 0 : head;
}
