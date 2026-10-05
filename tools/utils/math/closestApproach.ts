/**
 * closestApproach — the minimum craft–target distance. The target is linearly interpolated onto
 * each craft sample inside its time range (1-min steps make that sub-metre), then a parabola
 * through the three squared distances around the smallest one places the minimum between
 * samples: relative motion in a short window is near-straight, so d² is near-quadratic in time.
 */
import type { TimedPositions } from '../../@types/math/TimedPositions';

export function closestApproach(
  craft: TimedPositions,
  target: TimedPositions,
): { jd: number; distanceKm: number } {
  const d2: number[] = [];
  const at: number[] = [];
  let j = 0;
  for (let i = 0; i < craft.t.length; i++) {
    const ti = craft.t[i]!;
    if (ti < target.t[0]! || ti > target.t[target.t.length - 1]!) continue;
    while (target.t[j + 1]! < ti) j++;
    const w = (ti - target.t[j]!) / (target.t[j + 1]! - target.t[j]!);
    let sum = 0;
    for (let a = 0; a < 3; a++) {
      const p = target.pos[3 * j + a]! * (1 - w) + target.pos[3 * (j + 1) + a]! * w;
      sum += (craft.pos[3 * i + a]! - p) ** 2;
    }
    d2.push(sum);
    at.push(ti);
  }
  if (d2.length === 0) throw new Error('closestApproach: tracks do not overlap');
  let m = 0;
  for (let k = 1; k < d2.length; k++) if (d2[k]! < d2[m]!) m = k;
  if (m === 0 || m === d2.length - 1) return { jd: at[m]!, distanceKm: Math.sqrt(d2[m]!) };

  const [a, b, c] = [d2[m - 1]!, d2[m]!, d2[m + 1]!];
  const curvature = a - 2 * b + c;
  const offset = curvature > 0 ? (0.5 * (a - c)) / curvature : 0;
  const min = b - 0.25 * (a - c) * offset;
  return {
    jd: at[m]! + offset * (at[m + 1]! - at[m - 1]!) * 0.5,
    distanceKm: Math.sqrt(Math.max(min, 0)),
  };
}
