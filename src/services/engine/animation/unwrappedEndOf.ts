/**
 * unwrappedEndOf — where a segment's own path ends from `from`: its planned end,
 * except that a yaw/roll tween lands on `from + wrap(to − from)`, not on its raw
 * held `to` 2πk away. A crossfade starts the incoming plan here so both plans
 * turn the same way; `segmentValueAt` keeps the raw `to` (parity).
 */
import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { Vec3 } from '../../../@types/math/Vec3';
import { lerpChannel } from './lerpChannel';
import { segmentValueAt } from './segmentValueAt';

export function unwrappedEndOf<V extends number | Vec3>(seg: BaseSegment, from: V): V {
  const angle = seg.channel === 'yaw' || seg.channel === 'roll';
  return seg.segKind === 'tween' && angle
    ? lerpChannel(seg.channel, seg.space, from, seg.to as V, 1)
    : segmentValueAt(seg, from, seg.endSec);
}
