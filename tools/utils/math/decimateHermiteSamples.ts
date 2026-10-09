/**
 * decimateHermiteSamples — the indices to keep so a cubic Hermite through the kept samples
 * (their f32 velocities, as stored) passes within `tolKm` of every dropped one. Greedy: from
 * each kept sample, reach as far as every skipped sample stays in tolerance, keep that last
 * one and go on. First and last samples are always kept.
 */
import { hermitePositionKm } from './hermitePositionKm';

export function decimateHermiteSamples(
  t: Float64Array,
  pos: Float64Array,
  vel: Float32Array,
  tolKm: number,
): Uint32Array {
  const n = t.length;
  const kept = [0];
  let from = 0;
  while (from < n - 1) {
    let to = from + 1;
    for (let cand = from + 2; cand < n; cand++) {
      let fits = true;
      for (let k = from + 1; k < cand && fits; k++) {
        const [x, y, z] = hermitePositionKm(t, pos, vel, from, cand, t[k]!);
        fits = Math.hypot(x - pos[3 * k]!, y - pos[3 * k + 1]!, z - pos[3 * k + 2]!) <= tolKm;
      }
      if (!fits) break;
      to = cand;
    }
    kept.push(to);
    from = to;
  }
  return Uint32Array.from(kept);
}
