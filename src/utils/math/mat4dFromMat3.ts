/**
 * mat4dFromMat3 — embed a tight 9-element column-major `Mat3` (`m[c*3+r]`) as
 * the top-left block of an f64 mat4, homogeneous row/column left identity.
 *
 * A hand embed, NOT `mat4d.fromMat3`: wgpu-matrix's own mat3 is a PADDED
 * 12-float layout (columns at 0/4/8), so it would read the wrong slots. Placing
 * the columns transposed mirrors the body instead, and no compiler check
 * catches either — the callers' round-trip tests are what discriminate them.
 */

import type { Mat3 } from '../../@types/math/Mat3';

export function mat4dFromMat3(m: Readonly<Mat3>): Float64Array {
  return new Float64Array([
    m[0],
    m[1],
    m[2],
    0,
    m[3],
    m[4],
    m[5],
    0,
    m[6],
    m[7],
    m[8],
    0,
    0,
    0,
    0,
    1,
  ]);
}
