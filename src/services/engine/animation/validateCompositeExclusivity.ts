/**
 * validateCompositeExclusivity — a `CompositeTrack` is a base writer for each
 * channel it declares, so a base segment on one of those channels overlapping
 * its window is a clash: the evaluator would let the composite silently win.
 * Channels it does not declare (a flyPath's roll) stay open to base writers.
 *
 * It also pins the declaration to the sample's actual keys, so `channels` and
 * `sample` can never drift: the evaluator trusts `channels` to pick writers.
 */

import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { CompositeTrack } from '../../../@types/animation/compiledClip/CompositeTrack';
import type { Channel } from '../../../@types/animation/Channel';

export function validateCompositeExclusivity(
  baseTracks: Record<Channel, BaseSegment[]>,
  compositeTracks: readonly CompositeTrack[],
): void {
  for (const track of compositeTracks) {
    const declared = new Set<string>(track.channels);
    const written = Object.keys(track.sample(0));
    if (written.length !== declared.size || written.some((k) => !declared.has(k))) {
      throw new Error(
        `composite track [${track.startSec}, ${track.endSec}) declares channels ` +
          `[${[...declared].join(', ')}] but its sample writes [${written.join(', ')}].`,
      );
    }
    for (const ch of track.channels) {
      for (const seg of baseTracks[ch]) {
        const overlaps = seg.startSec < track.endSec && track.startSec < seg.endSec;
        if (overlaps) {
          throw new Error(
            `composite window [${track.startSec}, ${track.endSec}) overlaps a base '${ch}' writer ` +
              `[${seg.startSec}, ${seg.endSec}). The composite owns '${ch}' for its window — ` +
              `move the conflicting camera action outside it.`,
          );
        }
      }
    }
  }
}
