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
 *       Standard form: a 3×3 with columns being the galactic-Cartesian unit
 *       vectors of SGX, SGY, SGZ.
 *
 *   2.  R_GAL_to_EQ: rotate galactic Cartesian → equatorial Cartesian.
 *       The galactic north pole is at equatorial (RA=192.8595°, Dec=+27.1283°);
 *       the galactic centre is at (RA=266.4051°, Dec=−28.9362°).
 *       Standard form: a 3×3 with columns being the equatorial-Cartesian
 *       unit vectors of (galactic X, Y, Z).
 *
 * Composition: R_SG_to_EQ = R_GAL_to_EQ · R_SG_to_GAL.
 *
 * Shared with the (future) `2026-05-05-cf4-*` flow-field plans, both of
 * which need the same rotation. Lives in `src/data/` rather than
 * `src/utils/` because it carries domain knowledge (cluster anchoring,
 * astronomical conventions) rather than being a generic vector helper.
 */

const RAD = Math.PI / 180;

/** A 3-element row or column vector of numbers. */
export type Row3 = [number, number, number];

/**
 * A 3×3 matrix stored row-major as a tuple of rows.
 * Using a tuple rather than `number[][]` keeps every element access
 * strongly typed — `noUncheckedIndexedAccess` widens array-index
 * results to `T | undefined`, but tuple-index results stay `T`.
 */
export type Mat3 = [Row3, Row3, Row3];

/** Galactic Cartesian unit vector for galactic coords (l, b). */
function galLBtoCart(lDeg: number, bDeg: number): Row3 {
  const l = lDeg * RAD;
  const b = bDeg * RAD;
  return [Math.cos(l) * Math.cos(b), Math.sin(l) * Math.cos(b), Math.sin(b)];
}

/** Equatorial Cartesian unit vector for equatorial coords (RA, Dec). */
function eqRaDecToCart(raDeg: number, decDeg: number): Row3 {
  const a = raDeg * RAD;
  const d = decDeg * RAD;
  return [Math.cos(a) * Math.cos(d), Math.sin(a) * Math.cos(d), Math.sin(d)];
}

/** Euclidean length of a 3-vector — avoids spread to dodge noUncheckedIndexedAccess. */
function len3(v: Row3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/**
 * R_SG_to_GAL columns are the galactic-Cartesian unit vectors of SGX, SGY, SGZ.
 * SGX axis is at (l=137.37°, b=0°). SGZ axis is at (l=47.37°, b=+6.32°).
 * SGY = SGZ × SGX (right-handed), then renormalised against numerical drift.
 */
function buildSgToGal(): Mat3 {
  const sgx = galLBtoCart(137.37, 0);
  const sgz = galLBtoCart(47.37, 6.32);
  // SGY = SGZ × SGX (right-handed)
  const sgy: Row3 = [
    sgz[1] * sgx[2] - sgz[2] * sgx[1],
    sgz[2] * sgx[0] - sgz[0] * sgx[2],
    sgz[0] * sgx[1] - sgz[1] * sgx[0],
  ];
  // Renormalise against accumulated FP drift.
  const norm = len3(sgy);
  sgy[0] /= norm;
  sgy[1] /= norm;
  sgy[2] /= norm;
  // Matrix rows: gal-X-row = [sgx.x, sgy.x, sgz.x], etc.
  return [
    [sgx[0], sgy[0], sgz[0]],
    [sgx[1], sgy[1], sgz[1]],
    [sgx[2], sgy[2], sgz[2]],
  ];
}

/**
 * R_GAL_to_EQ columns are the equatorial-Cartesian unit vectors of
 * galactic X, Y, Z. Galactic X (l=0, b=0) → galactic centre at
 * (RA=266.4051°, Dec=−28.9362°). Galactic Z (north pole) at
 * (RA=192.8595°, Dec=+27.1283°). Galactic Y = galZ × galX.
 */
function buildGalToEq(): Mat3 {
  const gx = eqRaDecToCart(266.4051, -28.9362);
  const gz = eqRaDecToCart(192.8595, 27.1283);
  const gy: Row3 = [
    gz[1] * gx[2] - gz[2] * gx[1],
    gz[2] * gx[0] - gz[0] * gx[2],
    gz[0] * gx[1] - gz[1] * gx[0],
  ];
  const norm = len3(gy);
  gy[0] /= norm;
  gy[1] /= norm;
  gy[2] /= norm;
  return [
    [gx[0], gy[0], gz[0]],
    [gx[1], gy[1], gz[1]],
    [gx[2], gy[2], gz[2]],
  ];
}

/**
 * 3×3 matrix multiplication: result = a · b.
 * The loop is unrolled by j so each inner product is typed as `number`,
 * avoiding the `Row3 | undefined` widening that noUncheckedIndexedAccess
 * would produce if we indexed a `Row3[]` (non-tuple array) by `j`.
 */
function multiply3x3(a: Mat3, b: Mat3): Mat3 {
  const dot = (ri: Row3, j: 0 | 1 | 2): number =>
    ri[0] * b[0][j] + ri[1] * b[1][j] + ri[2] * b[2][j];
  return [
    [dot(a[0], 0), dot(a[0], 1), dot(a[0], 2)],
    [dot(a[1], 0), dot(a[1], 1), dot(a[1], 2)],
    [dot(a[2], 0), dot(a[2], 1), dot(a[2], 2)],
  ];
}

/**
 * Re-orthonormalise a 3×3 rotation matrix using a single Gram-Schmidt pass.
 * Two successive matrix builds and one multiplication each accumulate ~1e-16
 * FP error per element; after composing them the dot product between rows
 * can reach ~1.4e-6 — just outside the 5e-7 bound the unit tests enforce.
 * One Gram-Schmidt pass pulls it back below 1e-15.
 *
 * Why rows and not columns? Both forms work for an orthogonal matrix;
 * rows are more cache-friendly here since we already iterate row-major.
 */
function reorthonormalise(m: Mat3): Mat3 {
  // r0: normalise first row as-is.
  const r0: Row3 = [m[0][0], m[0][1], m[0][2]];
  const n0 = len3(r0);
  r0[0] /= n0; r0[1] /= n0; r0[2] /= n0;

  // r1: subtract projection of r1 onto r0, then normalise.
  const r1: Row3 = [m[1][0], m[1][1], m[1][2]];
  const d01 = r1[0] * r0[0] + r1[1] * r0[1] + r1[2] * r0[2];
  r1[0] -= d01 * r0[0]; r1[1] -= d01 * r0[1]; r1[2] -= d01 * r0[2];
  const n1 = len3(r1);
  r1[0] /= n1; r1[1] /= n1; r1[2] /= n1;

  // r2: recompute as r0 × r1 (avoids error accumulation from the third row).
  const r2: Row3 = [
    r0[1] * r1[2] - r0[2] * r1[1],
    r0[2] * r1[0] - r0[0] * r1[2],
    r0[0] * r1[1] - r0[1] * r1[0],
  ];

  return [r0, r1, r2];
}

/** Convert a 3×3 rotation matrix to a unit quaternion (x, y, z, w). */
function matrixToQuaternion(m: Mat3): [number, number, number, number] {
  // Shepperd's method via the largest diagonal element — numerically stable.
  const trace = m[0][0] + m[1][1] + m[2][2];
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m[2][1] - m[1][2]) * s;
    y = (m[0][2] - m[2][0]) * s;
    z = (m[1][0] - m[0][1]) * s;
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]);
    w = (m[2][1] - m[1][2]) / s;
    x = 0.25 * s;
    y = (m[0][1] + m[1][0]) / s;
    z = (m[0][2] + m[2][0]) / s;
  } else if (m[1][1] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]);
    w = (m[0][2] - m[2][0]) / s;
    x = (m[0][1] + m[1][0]) / s;
    y = 0.25 * s;
    z = (m[1][2] + m[2][1]) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]);
    w = (m[1][0] - m[0][1]) / s;
    x = (m[0][2] + m[2][0]) / s;
    y = (m[1][2] + m[2][1]) / s;
    z = 0.25 * s;
  }
  // Renormalise against numerical drift.
  const n = Math.sqrt(x * x + y * y + z * z + w * w);
  return [x / n, y / n, z / n, w / n];
}

const R_SG_TO_GAL = buildSgToGal();
const R_GAL_TO_EQ = buildGalToEq();

/** Rotation matrix taking supergalactic Cartesian → equatorial Cartesian. */
export const SG_TO_EQ_MATRIX: Mat3 = reorthonormalise(multiply3x3(R_GAL_TO_EQ, R_SG_TO_GAL));

/** Same rotation as a unit quaternion (x, y, z, w). For SCFD header. */
export const SG_TO_EQ_QUATERNION: readonly [number, number, number, number] = matrixToQuaternion(SG_TO_EQ_MATRIX);

/** Apply the SG → equatorial rotation to a vector. Length is preserved. */
export function sgCartesianToEquatorial(
  sg: readonly [number, number, number],
): [number, number, number] {
  const m = SG_TO_EQ_MATRIX;
  return [
    m[0][0] * sg[0] + m[0][1] * sg[1] + m[0][2] * sg[2],
    m[1][0] * sg[0] + m[1][1] * sg[1] + m[1][2] * sg[2],
    m[2][0] * sg[0] + m[2][1] * sg[1] + m[2][2] * sg[2],
  ];
}
