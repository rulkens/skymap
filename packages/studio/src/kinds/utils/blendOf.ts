/** A seq's blend in seconds: its overlap, or the longest of a per-join list. */
import type { SeqOverlap } from '../../../../../src/@types/animation/SeqOverlap';

export function blendOf(overlap: SeqOverlap | undefined): number {
  return overlap === undefined
    ? 0
    : typeof overlap === 'number'
      ? overlap
      : Math.max(0, ...overlap);
}
