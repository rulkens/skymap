/**
 * resolveSeqJoins — how each channel crosses a join of an overlapping `seq`,
 * decided per consecutive pair of that channel's writers from their real windows:
 * a gap rests, an overlap crossfades (the incoming segment gets `blendIn`), an
 * abutting pair is the matched join (a rest until it lands). A pair whose paths
 * part in no overlapping seq keeps today's rules. Every refusal names the seq and
 * the join: at most two writers live (rule 3), no blend across a frame change
 * (rule 4), and no composite or looping spin in a blend or join.
 */
import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { CompositeTrack } from '../../../@types/animation/compiledClip/CompositeTrack';
import type { Channel } from '../../../@types/animation/Channel';
import type { SeqSteps } from '../../../@types/animation/SeqSteps';
import { baseTracksOf } from './baseTracksOf';
import { buildFrameLegs } from './buildFrameLegs';

export function resolveSeqJoins(
  baseSegs: readonly BaseSegment[],
  composites: readonly CompositeTrack[],
  seqs: readonly SeqSteps[],
): BaseSegment[] {
  const resolved = [...baseSegs];
  if (seqs.length === 0) return resolved;
  const segIndex = new Map(baseSegs.map((s, i) => [s, i]));
  const compositeIndex = new Map(composites.map((c, i) => [c, i]));
  const spanOf = (steps: SeqSteps['steps'], w: BaseSegment | CompositeTrack) =>
    steps.findIndex((step) => {
      const [lo, hi] = 'segKind' in w ? step.segs : step.composites;
      const i = 'segKind' in w ? segIndex.get(w)! : compositeIndex.get(w)!;
      return lo <= i && i < hi;
    });
  // The one seq where the two writers' paths part (a nested seq holds both in one
  // span of its parent); join k is the one just before span k.
  const joinOf = (a: BaseSegment | CompositeTrack, b: BaseSegment | CompositeTrack) => {
    for (const seq of seqs) {
      const [sa, sb] = [spanOf(seq.steps, a), spanOf(seq.steps, b)];
      if (sa >= 0 && sb >= 0 && sa !== sb)
        return `seq at ${seq.startSec}s, join ${Math.max(sa, sb)}: `;
    }
    return null;
  };
  const legs = buildFrameLegs(baseTracksOf(baseSegs)).legs;
  const channels = new Set<Channel>([
    ...baseSegs.map((s) => s.channel),
    ...composites.flatMap((c) => c.channels),
  ]);

  for (const ch of channels) {
    const writers = [
      ...baseSegs.filter((s) => s.channel === ch),
      ...composites.filter((c) => (c.channels as readonly Channel[]).includes(ch)),
    ].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
    for (let k = 1; k < writers.length; k++) {
      const [a, b] = [writers[k - 1]!, writers[k]!];
      const prefix = joinOf(a, b);
      if (prefix === null || b.startSec > a.endSec) continue;
      const zeroLength = a.endSec === a.startSec || b.endSec === b.startSec;
      if (b.startSec === a.endSec && zeroLength) continue;
      if (!('segKind' in a) || !('segKind' in b)) {
        throw new Error(`${prefix}a composite move cannot blend or join on '${ch}'`);
      }
      if (a.loop || b.loop) {
        throw new Error(`${prefix}a looping spin cannot blend or join on '${ch}'`);
      }
      if (b.startSec === a.endSec) continue;
      if (b.endSec < a.endSec) {
        throw new Error(
          `${prefix}the incoming '${ch}' move ends at ${b.endSec}s, before the outgoing one (${a.endSec}s)`,
        );
      }
      if (
        writers.some((w) => w !== a && w !== b && w.startSec <= b.startSec && b.startSec < w.endSec)
      ) {
        throw new Error(`${prefix}three writers are live on '${ch}' at ${b.startSec}s`);
      }
      // The lens is frame-free, so no leg ever converts it.
      const leg = legs.find((l) => l.startSec > a.startSec && l.startSec < a.endSec);
      if (ch !== 'fov' && leg !== undefined) {
        throw new Error(
          `${prefix}the '${ch}' blend [${b.startSec},${a.endSec}) crosses a frame change at ${leg.startSec}s`,
        );
      }
      resolved[segIndex.get(b)!] = { ...b, blendIn: { startSec: b.startSec, endSec: a.endSec } };
    }
  }
  return resolved;
}
