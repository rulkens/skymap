/**
 * fitSimilarity2D — the closed-form least-squares similarity (scale, turn, offset)
 * carrying points p onto q, mirrored or not, whichever misses less.
 */

import type { Similarity2D } from '../../@types/math/Similarity2D';
import type { Vec2 } from '../../@types/math/Vec2';

export function fitSimilarity2D(
  p: readonly Readonly<Vec2>[],
  q: readonly Readonly<Vec2>[],
): Similarity2D {
  const plain = fit(p, q, false);
  const mirrored = fit(p, q, true);
  return mirrored.rms < plain.rms ? mirrored : plain;
}

function fit(
  p: readonly Readonly<Vec2>[],
  q: readonly Readonly<Vec2>[],
  mirrored: boolean,
): Similarity2D {
  const n = p.length;
  const px = p.map((v) => (mirrored ? -v[0] : v[0]));
  const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / n;
  const pcx = mean(px);
  const pcy = mean(p.map((v) => v[1]));
  const qcx = mean(q.map((v) => v[0]));
  const qcy = mean(q.map((v) => v[1]));
  let dot = 0;
  let cross = 0;
  let norm = 0;
  for (let i = 0; i < n; i++) {
    const ax = px[i]! - pcx;
    const ay = p[i]![1] - pcy;
    const bx = q[i]![0] - qcx;
    const by = q[i]![1] - qcy;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
    norm += ax * ax + ay * ay;
  }
  const theta = Math.atan2(cross, dot);
  const scale = Math.hypot(dot, cross) / norm;
  const c = Math.cos(theta) * scale;
  const s = Math.sin(theta) * scale;
  const t: Vec2 = [qcx - (c * pcx - s * pcy), qcy - (s * pcx + c * pcy)];
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const x = px[i]!;
    const y = p[i]![1];
    sq += (c * x - s * y + t[0] - q[i]![0]) ** 2 + (s * x + c * y + t[1] - q[i]![1]) ** 2;
  }
  return { scale, theta, mirrored, t, rms: Math.sqrt(sq / n) };
}
