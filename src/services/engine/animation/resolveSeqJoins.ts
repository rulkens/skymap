/**
 * resolveSeqJoins — how each channel crosses a join of an overlapping `seq`,
 * decided per consecutive pair of that channel's writers from their real windows:
 * a gap rests, an overlap crossfades (the incoming segment gets `blendIn`), and an
 * abutting pair is a matched join (both curves turn Hermite, meeting at one speed).
 * A pair whose paths part in no overlapping seq keeps today's rules. Every refusal
 * names the seq and the join: at most two writers live (rule 3), no blend or join
 * across a frame change (rule 4), one space per join, and no composite or looping
 * spin in either.
 */
import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { CompositeTrack } from '../../../@types/animation/compiledClip/CompositeTrack';
import type { Channel } from '../../../@types/animation/Channel';
import type { SeqSteps } from '../../../@types/animation/SeqSteps';
import type { CameraPose } from '../../../@types/camera/pose/CameraPose';
import type { Vec3 } from '../../../@types/math/Vec3';
import { baseTracksOf } from './baseTracksOf';
import { buildFrameLegs } from './buildFrameLegs';
import { easeEndSlopes } from './easeEndSlopes';
import { legIndexAt } from './legIndexAt';
import { segmentValueAt } from './segmentValueAt';
import { unwrappedEndOf } from './unwrappedEndOf';
import { sameFrame } from '../camera/arms/sameFrame';
import { DEFAULT_FOV_Y_RAD } from '../camera/framing/cameraFraming';
import { byStartSec } from '../../../utils/animation/byStartSec';
import { dot3 } from '../../../utils/math/dot3';

// A segment's average velocity in its own space; a scalar rides as [v, 0, 0] so
// target and scalar joins share one dot product. A spin's span is its `by`, a
// yaw/roll tween's the short arc.
function averageVelocity(seg: BaseSegment, from: number | Vec3): Vec3 {
  const dur = seg.endSec - seg.startSec;
  if (seg.channel === 'target') {
    const [to, f] = [seg.to as Vec3, from as Vec3];
    return [(to[0] - f[0]) / dur, (to[1] - f[1]) / dur, (to[2] - f[2]) / dur];
  }
  if (seg.segKind === 'spin') return [(seg.to as number) / dur, 0, 0];
  const [f, to] = [from as number, unwrappedEndOf(seg, from as number)];
  return [(seg.space === 'log' ? Math.log(to) - Math.log(f) : to - f) / dur, 0, 0];
}

// The join speed is the harmonic mean 2·|a|·|b| / (|a| + |b|), never above twice
// the slower; 0 when the two turn back or a span is 0 or not finite (a 'live'
// start compiles against a zero pose). Each slope is that speed over its average.
function joinSlopes(a: Vec3, b: Vec3): { readonly out: number; readonly in: number } {
  const dot = dot3(a, b);
  if (!(Number.isFinite(dot) && dot > 0)) return { out: 0, in: 0 };
  const [sa, sb] = [Math.hypot(...a), Math.hypot(...b)];
  return { out: (2 * sb) / (sa + sb), in: (2 * sa) / (sa + sb) };
}

export function resolveSeqJoins(
  baseSegs: readonly BaseSegment[],
  composites: readonly CompositeTrack[],
  seqs: readonly SeqSteps[],
  start: CameraPose,
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
  // Where a blend would cross frames: two tweens in different frames, a leg the
  // evaluator reads `a` in that is not `a`'s own (one opening at `a`'s start, after
  // it), or any leg opening later inside `a`'s window.
  const frameOf = (s: BaseSegment) => s.frame ?? 'absolute';
  const frameChangeIn = (a: BaseSegment, b: BaseSegment): number | undefined => {
    if (a.segKind === 'tween' && b.segKind === 'tween' && !sameFrame(frameOf(a), frameOf(b))) {
      return b.startSec;
    }
    const readIn = legs[legIndexAt(legs, a.startSec)]!.frame;
    if (a.segKind === 'tween' && !sameFrame(readIn, frameOf(a))) return a.startSec;
    return legs.find((l) => l.startSec > a.startSec && l.startSec < a.endSec)?.startSec;
  };
  const channels = new Set<Channel>([
    ...baseSegs.map((s) => s.channel),
    ...composites.flatMap((c) => c.channels),
  ]);
  const froms = new Map<BaseSegment, number | Vec3>();
  const joins = new Map<BaseSegment, { m0?: number; m1?: number }>();

  for (const ch of channels) {
    const writers = [
      ...baseSegs.filter((s) => s.channel === ch),
      ...composites.filter((c) => (c.channels as readonly Channel[]).includes(ch)),
    ].sort(byStartSec);
    // Each base writer's planned `from`, folded as the evaluator folds it.
    let running: number | Vec3 =
      ch === 'roll'
        ? (start.roll ?? 0)
        : ch === 'fov'
          ? (start.fov ?? DEFAULT_FOV_Y_RAD)
          : start[ch];
    for (const w of writers) {
      if (!('segKind' in w)) continue;
      froms.set(w, w.from ?? running);
      running = segmentValueAt(w, froms.get(w)!, w.endSec);
    }
    for (let k = 1; k < writers.length; k++) {
      const [a, b] = [writers[k - 1]!, writers[k]!];
      const prefix = joinOf(a, b);
      if (prefix === null || b.startSec > a.endSec) continue;
      const abut = b.startSec === a.endSec;
      const zeroLength = a.endSec === a.startSec || b.endSec === b.startSec;
      if (abut && zeroLength) continue;
      if (!('segKind' in a) || !('segKind' in b)) {
        throw new Error(`${prefix}a composite move cannot blend or join on '${ch}'`);
      }
      if (a.loop || b.loop) {
        throw new Error(`${prefix}a looping spin cannot blend or join on '${ch}'`);
      }
      if (!abut && b.endSec < a.endSec) {
        throw new Error(
          `${prefix}the incoming '${ch}' move ends at ${b.endSec}s, before the outgoing one (${a.endSec}s)`,
        );
      }
      if (
        !abut &&
        writers.some((w) => w !== a && w !== b && w.startSec <= b.startSec && b.startSec < w.endSec)
      ) {
        throw new Error(`${prefix}three writers are live on '${ch}' at ${b.startSec}s`);
      }
      // A join reads its spans from `a`'s folded `from`, so no leg may open after
      // the writer before `a` starts. The lens is frame-free, so no leg converts it.
      const sinceSec = writers[k - 2]?.startSec ?? -Infinity;
      const changeSec =
        ch === 'fov'
          ? undefined
          : abut
            ? legs.find((l) => l.startSec > sinceSec && l.startSec <= b.startSec)?.startSec
            : frameChangeIn(a, b);
      if (changeSec !== undefined) {
        const what = abut ? `join at ${b.startSec}s` : `blend [${b.startSec},${a.endSec})`;
        throw new Error(`${prefix}the '${ch}' ${what} crosses a frame change at ${changeSec}s`);
      }
      if (!abut) {
        resolved[segIndex.get(b)!] = { ...b, blendIn: { startSec: b.startSec, endSec: a.endSec } };
        continue;
      }
      if (a.space !== b.space) {
        throw new Error(`${prefix}the '${ch}' join runs '${a.space}' into '${b.space}'`);
      }
      const slopes = joinSlopes(
        averageVelocity(a, froms.get(a)!),
        averageVelocity(b, froms.get(b)!),
      );
      joins.set(a, { ...joins.get(a), m1: slopes.out });
      joins.set(b, { ...joins.get(b), m0: slopes.in });
    }
  }
  // An unmatched end keeps its ease's slope, held to m0² + m1² ≤ 9 (monotone).
  const outer = (slope: number, join: number) =>
    Math.min(Math.max(slope, 0), Math.sqrt(9 - join * join));
  for (const [seg, { m0, m1 }] of joins) {
    const ends = seg.curve.kind === 'ease' ? easeEndSlopes(seg.curve.ease) : { start: 0, end: 0 };
    const i = segIndex.get(seg)!;
    resolved[i] = {
      ...resolved[i]!,
      curve: { kind: 'hermite', m0: m0 ?? outer(ends.start, m1!), m1: m1 ?? outer(ends.end, m0!) },
    };
  }
  return resolved;
}
