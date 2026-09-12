/**
 * Pull a nearly-orthonormal column-major `Mat3` back onto the rotation manifold
 * with a single Gram-Schmidt pass over its columns.
 *
 * Successive builds and multiplications each accumulate ~1e-16 FP error per
 * element; left unchecked the column dot products drift to ~1.4e-6, just
 * outside the 5e-7 bound rotation tests enforce. One pass pulls it below 1e-15.
 *
 * Column 2 is rebuilt as `c0 × c1`, so the input triple must be RIGHT-handed:
 * an `imagePlaneBasis` (right, up, forward) triple is left-handed and comes
 * back silently mirrored — pass that one as (forward, up, right).
 */

import type { Mat3 } from '../../@types/math/Mat3';

export function reorthonormalise(m: Mat3): Mat3 {
  let c0x = m[0]!,
    c0y = m[1]!,
    c0z = m[2]!;
  const n0 = Math.sqrt(c0x * c0x + c0y * c0y + c0z * c0z);
  c0x /= n0;
  c0y /= n0;
  c0z /= n0;

  let c1x = m[3]!,
    c1y = m[4]!,
    c1z = m[5]!;
  const d01 = c1x * c0x + c1y * c0y + c1z * c0z;
  c1x -= d01 * c0x;
  c1y -= d01 * c0y;
  c1z -= d01 * c0z;
  const n1 = Math.sqrt(c1x * c1x + c1y * c1y + c1z * c1z);
  c1x /= n1;
  c1y /= n1;
  c1z /= n1;

  const c2x = c0y * c1z - c0z * c1y;
  const c2y = c0z * c1x - c0x * c1z;
  const c2z = c0x * c1y - c0y * c1x;

  return [c0x, c0y, c0z, c1x, c1y, c1z, c2x, c2y, c2z];
}
