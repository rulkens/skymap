/**
 * segmentValueAt — the value a base segment gives its channel at `t ≥ startSec`,
 * starting from `from`. Shared by the runtime base walk and compile-time readers,
 * so its value at `endSec` is THE segment's planned end. A tween moves to `to`;
 * a spin adds its delta `to` onto `from`. Past `endSec` a tween holds `to`, a
 * finite spin holds `from + to`, and a `loop` spin keeps turning at `to` per window.
 */

import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { SegmentCurve } from '../../../@types/animation/compiledClip/SegmentCurve';
import type { Vec3 } from '../../../@types/math/Vec3';
import { EASE } from './ease';
import { lerpChannel } from './lerpChannel';
import { hermiteUnit } from '../../../utils/math/hermiteUnit';

function curveProgress(curve: SegmentCurve, u: number): number {
  switch (curve.kind) {
    case 'ease':
      return EASE[curve.ease](u);
    case 'hermite':
      return hermiteUnit(curve.m0, curve.m1, u);
  }
}

export function segmentValueAt<V extends number | Vec3>(seg: BaseSegment, from: V, t: number): V {
  const dur = seg.endSec - seg.startSec;
  if (seg.segKind === 'tween') {
    if (t >= seg.endSec) return seg.to as V;
    const localT = dur > 0 ? (t - seg.startSec) / dur : 1;
    return lerpChannel(seg.channel, seg.space, from, seg.to as V, curveProgress(seg.curve, localT));
  }
  const start = from as number;
  const by = seg.to as number;
  if (t < seg.endSec) {
    const localT = dur > 0 ? (t - seg.startSec) / dur : 1;
    return (start + by * curveProgress(seg.curve, localT)) as V;
  }
  if (!seg.loop) return (start + by) as V;
  return (start + by * (dur > 0 ? (t - seg.startSec) / dur : 1)) as V;
}
