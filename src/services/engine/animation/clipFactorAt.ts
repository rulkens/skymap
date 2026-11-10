/**
 * The clip factor of one address at clip time `t`: 1 before its first segment (or with none),
 * otherwise the segment that started last at or before `t` (it supersedes the earlier ones) on
 * the fade controller's smoothstep curve, holding its `to` once it ends.
 */

import type { FactorSegment } from '../../../@types/animation/compiledClip/FactorSegment';
import { smoothstep } from '../../../utils/math/smoothstep';

export function clipFactorAt(segments: readonly FactorSegment[] | undefined, t: number): number {
  if (segments === undefined) return 1;
  let i = segments.length - 1;
  while (i >= 0 && segments[i]!.startSec > t) i--;
  if (i < 0) return 1;
  const { startSec, endSec, from, to } = segments[i]!;
  return from + (to - from) * smoothstep(startSec, endSec, t);
}
