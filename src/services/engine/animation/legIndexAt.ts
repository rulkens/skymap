/** legIndexAt — the leg live at `t`: the last one opened at or before it. */
import type { FrameLeg } from '../../../@types/animation/compiledClip/FrameLeg';

export function legIndexAt(legs: readonly FrameLeg[], t: number): number {
  let index = 0;
  for (let i = 1; i < legs.length; i++) {
    if (legs[i]!.startSec <= t) index = i;
  }
  return index;
}
