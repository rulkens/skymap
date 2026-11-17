import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Distance from `p` to the segment a–b (not the infinite line: a track can double back past an end). */
export function pointSegmentDistance(
  p: Readonly<Vec3>,
  a: Readonly<Vec3>,
  b: Readonly<Vec3>,
): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]] as const;
  const abLen2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t =
    abLen2 > 0
      ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / abLen2))
      : 0;
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
}
