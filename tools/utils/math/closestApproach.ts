/**
 * closestApproach — the minimum distance of a craft-relative-to-body-centre track from the
 * origin. A parabola through the three squared distances around the smallest one places the
 * minimum between samples: relative motion in a short window is near-straight, so d² is
 * near-quadratic in time.
 */
import type { HorizonsVectorRow } from '../../parsers/@types/HorizonsVectorRow';

export function closestApproach(rows: readonly HorizonsVectorRow[]): {
  jd: number;
  distanceKm: number;
} {
  const d2 = rows.map((r) => r.xKm ** 2 + r.yKm ** 2 + r.zKm ** 2);
  const at = rows.map((r) => r.jd);
  if (d2.length === 0) throw new Error('closestApproach: no samples');
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
