/**
 * superGalacticTransform — pure rotation from supergalactic Cartesian
 * to equatorial Cartesian, both expressed in the same length unit
 * (rotations preserve length).
 *
 * The SG axis convention is Lahav 1991 / NED: SGX-axis points to
 * galactic (l, b) = (137.37°, 0°), SGZ-axis points to (l, b) = (47.37°, +6.32°).
 * We compose SG → galactic → equatorial via two well-known rotations:
 *
 *   1.  R_SG_to_GAL: rotate so SGX → (l=137.37°, b=0°), SGZ → galactic pole-ish.
 *       Standard form: a 3×3 with COLUMNS being the galactic-Cartesian unit
 *       vectors of SGX, SGY, SGZ.
 *
 *   2.  R_GAL_to_EQ: rotate galactic Cartesian → equatorial Cartesian.
 *       The galactic north pole is at equatorial (RA=192.8595°, Dec=+27.1283°);
 *       the galactic centre is at (RA=266.4051°, Dec=−28.9362°).
 *       Standard form: a 3×3 with COLUMNS being the equatorial-Cartesian
 *       unit vectors of (galactic X, Y, Z).
 *
 * Composition: R_SG_to_EQ = R_GAL_to_EQ · R_SG_to_GAL.
 *
 * ### Layout: column-major, flat 9-tuple Mat3 (from @types/Mat)
 *
 *   Cell at row r, column c is `m[c * 3 + r]`.  This matches the
 *   project-wide convention (column-major everywhere), gl-matrix, and
 *   WGSL.  The column-major form is also more natural for "build a
 *   rotation whose columns are the image axes": each axis is three
 *   contiguous elements rather than a stride-3 walk through nested
 *   rows.
 */

import type { Mat3 } from '../@types/math/Mat3';
import type { Mat4 } from '../@types/math/Mat4';
import type { Vec3 } from '../@types/math/Vec3';
import type { Vec4 } from '../@types/math/Vec4';
import { galacticToCartesian } from '../utils/math/galacticToCartesian';
import { eqRaDecToUnitCart } from '../utils/math/eqRaDecToUnitCart';
import { mat3FromColumns } from '../utils/math/mat3FromColumns';
import { multiply3x3 } from '../utils/math/multiply3x3';
import { reorthonormalise } from '../utils/math/reorthonormalise';
import { matrixToQuaternion } from '../utils/math/matrixToQuaternion';

/**
 * R_SG_to_GAL: columns are the galactic-Cartesian unit vectors of SGX,
 * SGY, SGZ.  Because the matrix is column-major flat, each axis is a
 * contiguous 3-element span — no juggling required.
 *
 * SGX axis is at (l=137.37°, b=0°). SGZ axis is at (l=47.37°, b=+6.32°).
 * SGY = SGZ × SGX (right-handed), then renormalised against numerical drift.
 */
function buildSgToGal(): Mat3 {
  const sgx = galacticToCartesian(137.37, 0);
  const sgz = galacticToCartesian(47.37, 6.32);
  const sgyX = sgz[1] * sgx[2] - sgz[2] * sgx[1];
  const sgyY = sgz[2] * sgx[0] - sgz[0] * sgx[2];
  const sgyZ = sgz[0] * sgx[1] - sgz[1] * sgx[0];
  const norm = Math.sqrt(sgyX * sgyX + sgyY * sgyY + sgyZ * sgyZ);
  const sgy: Vec3 = [sgyX / norm, sgyY / norm, sgyZ / norm];
  return mat3FromColumns(sgx, sgy, sgz);
}

/**
 * R_GAL_to_EQ: columns are the equatorial-Cartesian unit vectors of
 * galactic X, Y, Z.  Galactic X (l=0, b=0) → galactic centre at
 * (RA=266.4051°, Dec=−28.9362°).  Galactic Z (north pole) at
 * (RA=192.8595°, Dec=+27.1283°).  Galactic Y = galZ × galX.
 */
function buildGalToEq(): Mat3 {
  const gx = eqRaDecToUnitCart(266.4051, -28.9362);
  const gz = eqRaDecToUnitCart(192.8595, 27.1283);
  const gyX = gz[1] * gx[2] - gz[2] * gx[1];
  const gyY = gz[2] * gx[0] - gz[0] * gx[2];
  const gyZ = gz[0] * gx[1] - gz[1] * gx[0];
  const norm = Math.sqrt(gyX * gyX + gyY * gyY + gyZ * gyZ);
  const gy: Vec3 = [gyX / norm, gyY / norm, gyZ / norm];
  return mat3FromColumns(gx, gy, gz);
}

const R_SG_TO_GAL = buildSgToGal();
const R_GAL_TO_EQ = buildGalToEq();

/**
 * Rotation matrix taking supergalactic Cartesian → equatorial Cartesian,
 * stored as a flat column-major 9-tuple `Mat3`.
 */
export const SG_TO_EQ_MATRIX: Mat3 = reorthonormalise(multiply3x3(R_GAL_TO_EQ, R_SG_TO_GAL));

/** Same rotation as a unit quaternion (x, y, z, w). For SCFD header. */
export const SG_TO_EQ_QUATERNION: Readonly<Vec4> = matrixToQuaternion(SG_TO_EQ_MATRIX);

/**
 * Same rotation as a 16-element column-major Mat4 (rotation in the
 * upper-left 3x3, identity translation, w=1).  Ready to pass through
 * `mat4.fromValues(...SG_TO_EQ_MAT4_COL_MAJOR)` or to construct a
 * `Float32Array` for direct GPU upload.
 *
 * ### Why a separate export and not "build it in the renderer"
 *
 * A renderer-private hardcoded mat4 of the SG→EQ rotation can drift
 * from the canonical 3x3 — and any drift puts cluster labels (which
 * use `raDecDistToEqCart` → canonical 3x3) at different world
 * positions from the cube's voxels (which would use the renderer's
 * local copy).  This export is the canonical column-major form
 * derived from `SG_TO_EQ_MATRIX` once, at module init; every
 * consumer must import it rather than reconstruct.
 *
 * Column-major layout (matches gl-matrix and WebGPU mat4x4):
 *   index    0  4  8 12   col 0   col 1   col 2   col 3
 *            1  5  9 13   row 0   row 0   row 0   row 0
 *            2  6 10 14   row 1   row 1   row 1   row 1
 *            3  7 11 15   row 2   row 2   row 2   row 2
 *
 * i.e. column c row r lives at index c*4 + r.
 */
export const SG_TO_EQ_MAT4_COL_MAJOR: Mat4 = Object.freeze([
  // Column 0: SG_TO_EQ_MATRIX column 0 + 0 in the homogeneous w-row.
  SG_TO_EQ_MATRIX[0]!,
  SG_TO_EQ_MATRIX[1]!,
  SG_TO_EQ_MATRIX[2]!,
  0,
  // Column 1.
  SG_TO_EQ_MATRIX[3]!,
  SG_TO_EQ_MATRIX[4]!,
  SG_TO_EQ_MATRIX[5]!,
  0,
  // Column 2.
  SG_TO_EQ_MATRIX[6]!,
  SG_TO_EQ_MATRIX[7]!,
  SG_TO_EQ_MATRIX[8]!,
  0,
  // Column 3: translation = none, w = 1.
  0,
  0,
  0,
  1,
]) as Mat4;

/**
 * Apply the SG → equatorial rotation to a vector. Length is preserved.
 *
 *   eq[r] = Σ_c m[c*3 + r] · sg[c]
 */
export function sgCartesianToEquatorial(sg: Readonly<Vec3>): Vec3 {
  const m = SG_TO_EQ_MATRIX;
  return [
    m[0]! * sg[0] + m[3]! * sg[1] + m[6]! * sg[2],
    m[1]! * sg[0] + m[4]! * sg[1] + m[7]! * sg[2],
    m[2]! * sg[0] + m[5]! * sg[1] + m[8]! * sg[2],
  ];
}
