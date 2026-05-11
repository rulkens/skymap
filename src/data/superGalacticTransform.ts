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

import type { Mat3, Mat4, Vec3, Vec4 } from '../@types';

const RAD = Math.PI / 180;

/** Galactic Cartesian unit vector for galactic coords (l, b). */
function galLBtoCart(lDeg: number, bDeg: number): Vec3 {
  const l = lDeg * RAD;
  const b = bDeg * RAD;
  return [Math.cos(l) * Math.cos(b), Math.sin(l) * Math.cos(b), Math.sin(b)];
}

/** Equatorial Cartesian unit vector for equatorial coords (RA, Dec). */
function eqRaDecToCart(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * RAD;
  const d = decDeg * RAD;
  return [Math.cos(a) * Math.cos(d), Math.sin(a) * Math.cos(d), Math.sin(d)];
}

/** Euclidean length of a 3-vector. */
function len3(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/** Build a column-major Mat3 from three column vectors. */
function fromColumns(c0: Vec3, c1: Vec3, c2: Vec3): Mat3 {
  return [
    c0[0], c0[1], c0[2],
    c1[0], c1[1], c1[2],
    c2[0], c2[1], c2[2],
  ];
}

/**
 * R_SG_to_GAL: columns are the galactic-Cartesian unit vectors of SGX,
 * SGY, SGZ.  Because the matrix is column-major flat, each axis is a
 * contiguous 3-element span — no juggling required.
 *
 * SGX axis is at (l=137.37°, b=0°). SGZ axis is at (l=47.37°, b=+6.32°).
 * SGY = SGZ × SGX (right-handed), then renormalised against numerical drift.
 */
function buildSgToGal(): Mat3 {
  const sgx = galLBtoCart(137.37, 0);
  const sgz = galLBtoCart(47.37, 6.32);
  const sgyX = sgz[1] * sgx[2] - sgz[2] * sgx[1];
  const sgyY = sgz[2] * sgx[0] - sgz[0] * sgx[2];
  const sgyZ = sgz[0] * sgx[1] - sgz[1] * sgx[0];
  const norm = Math.sqrt(sgyX * sgyX + sgyY * sgyY + sgyZ * sgyZ);
  const sgy: Vec3 = [sgyX / norm, sgyY / norm, sgyZ / norm];
  return fromColumns(sgx, sgy, sgz);
}

/**
 * R_GAL_to_EQ: columns are the equatorial-Cartesian unit vectors of
 * galactic X, Y, Z.  Galactic X (l=0, b=0) → galactic centre at
 * (RA=266.4051°, Dec=−28.9362°).  Galactic Z (north pole) at
 * (RA=192.8595°, Dec=+27.1283°).  Galactic Y = galZ × galX.
 */
function buildGalToEq(): Mat3 {
  const gx = eqRaDecToCart(266.4051, -28.9362);
  const gz = eqRaDecToCart(192.8595, 27.1283);
  const gyX = gz[1] * gx[2] - gz[2] * gx[1];
  const gyY = gz[2] * gx[0] - gz[0] * gx[2];
  const gyZ = gz[0] * gx[1] - gz[1] * gx[0];
  const norm = Math.sqrt(gyX * gyX + gyY * gyY + gyZ * gyZ);
  const gy: Vec3 = [gyX / norm, gyY / norm, gyZ / norm];
  return fromColumns(gx, gy, gz);
}

/**
 * 3×3 column-major matrix multiplication: result = a · b.
 *
 *   result[c*3 + r] = Σ_k a[k*3 + r] · b[c*3 + k]
 */
function multiply3x3(a: Mat3, b: Mat3): Mat3 {
  const cell = (r: 0 | 1 | 2, c: 0 | 1 | 2): number =>
    a[0 * 3 + r]! * b[c * 3 + 0]! +
    a[1 * 3 + r]! * b[c * 3 + 1]! +
    a[2 * 3 + r]! * b[c * 3 + 2]!;
  return [
    cell(0, 0), cell(1, 0), cell(2, 0),
    cell(0, 1), cell(1, 1), cell(2, 1),
    cell(0, 2), cell(1, 2), cell(2, 2),
  ];
}

/**
 * Re-orthonormalise a column-major Mat3 using a single Gram-Schmidt pass
 * applied to its columns.  Two successive builds and one multiplication
 * each accumulate ~1e-16 FP error per element; without this pass the
 * column dot products can reach ~1.4e-6 — just outside the 5e-7 bound
 * the unit tests enforce.  One pass pulls it back below 1e-15.
 *
 * Columns are the natural Gram-Schmidt target here because each column
 * is contiguous in memory and represents one image axis of the rotation.
 */
function reorthonormalise(m: Mat3): Mat3 {
  // Column 0: normalise as-is.
  let c0x = m[0]!, c0y = m[1]!, c0z = m[2]!;
  const n0 = Math.sqrt(c0x * c0x + c0y * c0y + c0z * c0z);
  c0x /= n0; c0y /= n0; c0z /= n0;

  // Column 1: subtract projection onto column 0, then normalise.
  let c1x = m[3]!, c1y = m[4]!, c1z = m[5]!;
  const d01 = c1x * c0x + c1y * c0y + c1z * c0z;
  c1x -= d01 * c0x; c1y -= d01 * c0y; c1z -= d01 * c0z;
  const n1 = Math.sqrt(c1x * c1x + c1y * c1y + c1z * c1z);
  c1x /= n1; c1y /= n1; c1z /= n1;

  // Column 2: recompute as c0 × c1 (avoids accumulated error).
  const c2x = c0y * c1z - c0z * c1y;
  const c2y = c0z * c1x - c0x * c1z;
  const c2z = c0x * c1y - c0y * c1x;

  return [c0x, c0y, c0z, c1x, c1y, c1z, c2x, c2y, c2z];
}

/**
 * Convert a column-major 3×3 rotation matrix to a unit quaternion
 * (x, y, z, w).  Shepperd's method, indexed for column-major:
 * cell row r col c is `m[c * 3 + r]`.
 */
function matrixToQuaternion(m: Mat3): Vec4 {
  // Diagonal elements: m[0], m[4], m[8] (rows 0,1,2 of columns 0,1,2).
  const m00 = m[0]!, m11 = m[4]!, m22 = m[8]!;
  // Off-diagonals: m[r][c] in row-major → m[c*3 + r] here.
  const m01 = m[3]!, m02 = m[6]!;
  const m10 = m[1]!, m12 = m[7]!;
  const m20 = m[2]!, m21 = m[5]!;

  const trace = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const n = Math.sqrt(x * x + y * y + z * z + w * w);
  return [x / n, y / n, z / n, w / n];
}

const R_SG_TO_GAL = buildSgToGal();
const R_GAL_TO_EQ = buildGalToEq();

/**
 * Rotation matrix taking supergalactic Cartesian → equatorial Cartesian,
 * stored as a flat column-major 9-tuple `Mat3`.
 */
export const SG_TO_EQ_MATRIX: Mat3 = reorthonormalise(multiply3x3(R_GAL_TO_EQ, R_SG_TO_GAL));

/** Same rotation as a unit quaternion (x, y, z, w). For SCFD header. */
export const SG_TO_EQ_QUATERNION: Vec4 = matrixToQuaternion(SG_TO_EQ_MATRIX);

/**
 * Same rotation as a 16-element column-major Mat4 (rotation in the
 * upper-left 3x3, identity translation, w=1).  Ready to pass through
 * `mat4.fromValues(...SG_TO_EQ_MAT4_COL_MAJOR)` or to construct a
 * `Float32Array` for direct GPU upload.
 *
 * ### Why a separate export and not "build it in the renderer"
 *
 * The scalar-volume renderer previously kept a private hardcoded
 * mat4 of the SG→EQ rotation, with element values that diverged from
 * the canonical 3x3 by ~1.9 magnitude in places.  Cluster labels
 * (which use `raDecDistToEqCart` → canonical 3x3) ended up at
 * different world positions from the cube's voxels (which used the
 * renderer's local hardcoded mat4).  This export is the canonical
 * column-major form derived from `SG_TO_EQ_MATRIX` once, at module
 * init; every consumer must import it rather than reconstruct.
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
  SG_TO_EQ_MATRIX[0]!, SG_TO_EQ_MATRIX[1]!, SG_TO_EQ_MATRIX[2]!, 0,
  // Column 1.
  SG_TO_EQ_MATRIX[3]!, SG_TO_EQ_MATRIX[4]!, SG_TO_EQ_MATRIX[5]!, 0,
  // Column 2.
  SG_TO_EQ_MATRIX[6]!, SG_TO_EQ_MATRIX[7]!, SG_TO_EQ_MATRIX[8]!, 0,
  // Column 3: translation = none, w = 1.
  0, 0, 0, 1,
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
