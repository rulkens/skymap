/**
 * tangentToward — the unit tangent at the unit direction `d` that points toward
 * `toward` along their great circle, written into `out`. Returns false (and
 * zeroes `out`) when the two are parallel: no great circle is defined.
 */

import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { PARALLEL_TANGENT_EPS } from '../../data/labels/parallelTangentEps';

export function tangentToward(d: Readonly<Vec3>, toward: Readonly<Vec3>, out: Vec3): boolean {
  const k = d[0] * toward[0] + d[1] * toward[1] + d[2] * toward[2];
  const x = toward[0] - k * d[0];
  const y = toward[1] - k * d[1];
  const z = toward[2] - k * d[2];
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < PARALLEL_TANGENT_EPS) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return false;
  }
  out[0] = x / len;
  out[1] = y / len;
  out[2] = z / len;
  return true;
}
