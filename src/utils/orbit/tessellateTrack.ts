/**
 * tessellateTrack — a sampled track as a polyline whose chords stay within
 * `maxSagKm` of the Hermite curve. Every original sample is kept; an interval
 * is bisected while its midpoint sits farther than the tolerance from the chord,
 * so dense encounter windows add nothing and the deep-space days stay sparse.
 */

import type { SampledTrack } from '../../@types/scene/SampledTrack';
import { hermiteTrackAt } from './hermiteTrackAt';

const MAX_DEPTH = 24;

export function tessellateTrack(
  track: SampledTrack,
  maxSagKm: number,
): { tDays: Float64Array; posKm: Float64Array } {
  const t: number[] = [];
  const p: number[] = [];
  const n = track.tDays.length;

  function sample(i: number): [number, number, number] {
    return [track.posKm[3 * i]!, track.posKm[3 * i + 1]!, track.posKm[3 * i + 2]!];
  }

  // Emits (t0, p0] — every interval's start is emitted by the previous one, so a
  // shared endpoint is never duplicated.
  function refine(
    t0: number,
    p0: readonly number[],
    t1: number,
    p1: readonly number[],
    depth: number,
  ): void {
    const tm = 0.5 * (t0 + t1);
    const pm = hermiteTrackAt(track, tm);
    const sag = Math.hypot(
      pm[0] - 0.5 * (p0[0]! + p1[0]!),
      pm[1] - 0.5 * (p0[1]! + p1[1]!),
      pm[2] - 0.5 * (p0[2]! + p1[2]!),
    );
    if (sag > maxSagKm && depth < MAX_DEPTH) {
      refine(t0, p0, tm, pm, depth + 1);
      refine(tm, pm, t1, p1, depth + 1);
    } else {
      t.push(t1);
      p.push(p1[0]!, p1[1]!, p1[2]!);
    }
  }

  if (n === 0) return { tDays: new Float64Array(0), posKm: new Float64Array(0) };
  const first = sample(0);
  t.push(track.tDays[0]!);
  p.push(first[0], first[1], first[2]);
  for (let i = 0; i + 1 < n; i++) {
    refine(track.tDays[i]!, sample(i), track.tDays[i + 1]!, sample(i + 1), 0);
  }
  return { tDays: Float64Array.from(t), posKm: Float64Array.from(p) };
}
