/** byStartSec — a channel's writers, earliest start first; stable, so ties keep tree order. */
import type { BaseSegment } from '../../@types/animation/compiledClip/BaseSegment';

export function byStartSec(a: Pick<BaseSegment, 'startSec'>, b: Pick<BaseSegment, 'startSec'>) {
  return a.startSec - b.startSec;
}
