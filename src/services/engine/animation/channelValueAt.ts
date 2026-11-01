/**
 * channelValueAt — the compile-time base value a composite channel holds at
 * `atSec`: whatever wrote it last and ended by then (a base segment or a
 * composite's final sample), else the clip start. A composite's start pose and
 * the `from` of the first base segment after a composite both read it, so every
 * move continues from where the previous writer left the channel. Velocity and
 * oscillation layers add on top either way, so they are not folded in here.
 */

import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { CompositeSample } from '../../../@types/animation/compiledClip/CompositeSample';
import type { CompositeTrack } from '../../../@types/animation/compiledClip/CompositeTrack';

export function channelValueAt<C extends keyof CompositeSample>(
  ch: C,
  atSec: number,
  segments: readonly BaseSegment[],
  composites: readonly CompositeTrack[],
  startValue: NonNullable<CompositeSample[C]>,
): { readonly value: NonNullable<CompositeSample[C]>; readonly byComposite: boolean } {
  const writers = [
    ...segments.filter((s) => s.channel === ch && s.endSec <= atSec),
    ...composites.filter((c) => c.channels.includes(ch) && c.endSec <= atSec),
  ].sort((a, b) => a.startSec - b.startSec);

  let value = startValue;
  let byComposite = false;
  for (const w of writers) {
    byComposite = !('segKind' in w);
    if (!('segKind' in w)) {
      value = w.sample(w.endSec - w.startSec)[ch]!;
    } else if (w.segKind === 'tween') {
      value = w.to as typeof value;
    } else {
      // Additive, as the evaluator folds it: a looping spin keeps turning past
      // its window, at its own rate.
      const dur = w.endSec - w.startSec;
      const progress = w.loop && dur > 0 ? (atSec - w.startSec) / dur : 1;
      const from = (w.from ?? value) as number;
      value = (from + (w.to as number) * progress) as typeof value;
    }
  }
  return { value, byComposite };
}
