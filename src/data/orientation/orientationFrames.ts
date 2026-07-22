/**
 * orientationFrames — the single TS home of the four orientation bases.
 *
 * An orientation frame is a choice of pole: which physically meaningful north
 * pole the camera treats as "up" (see `OrientationFrameId`). Each frame is
 * defined by its frame-local-to-world basis — three equatorial J2000 unit
 * vectors — and this module is where those bases live so every consumer reads
 * one source of truth rather than re-deriving the rotations.
 *
 * The galactic basis below doubles as the mirror of the shader's galactic
 * constants in `shaders/lib/util.wesl` (`GAL_X_EQ / GAL_Y_EQ / GAL_Z_EQ`).
 * The two copies must stay bit-for-bit equal so the CPU-side model matrix and
 * the GPU generator agree on which way the disk points; the parity test in
 * `milkyWayModelMatrix.test.ts` scrapes the shader literals and compares,
 * making drift a test failure rather than a silent rendering bug.
 */
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import type { Vec4 } from '../../@types/math/Vec4';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';
import { ECLIPTIC_FRAME } from '../bodies/orbitPlaneFrames';
import { SG_TO_EQ_MATRIX } from '../superGalacticTransform';
import { mat3FromColumns } from '../../utils/math/mat3FromColumns';
import { matrixToQuaternion } from '../../utils/math/matrixToQuaternion';

export const GAL_X_EQ: Vec3 = [-0.054876, -0.873437, -0.483835]; // toward Galactic Centre
export const GAL_Y_EQ: Vec3 = [0.494109, -0.44483, 0.746982]; // direction of galactic rotation
export const GAL_Z_EQ: Vec3 = [-0.867666, -0.198076, 0.455984]; // toward North Galactic Pole (NGP)

/**
 * Middle-column-is-pole convention.
 *
 * Every basis below is assembled as `mat3FromColumns(col0, pole, col2)`, so the
 * frame's north pole always lives in the MIDDLE column (flat indices 3, 4, 5).
 * The orbit camera builds its eye position from a spherical (azimuth, elevation)
 * formula whose zenith is local +Y; putting the pole there means "elevation 90°"
 * looks straight down that frame's pole with no extra rotation in the camera.
 *
 * Each entry is a proper rotation (orthonormal, det +1). Starting from a frame's
 * natural right-handed basis (A, B, pole) — pole in the third column — the pole
 * is swapped into the middle and the displaced axis negated, giving (A, pole,
 * −B), which stays right-handed. Equatorial makes the pattern concrete: the
 * natural (+x, +y, +z) becomes (+x, +z, −y), NOT identity and NOT (+x, +z, +y)
 * (that transcription would flip the handedness to det −1).
 */
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
const sgCol = (i: number): Vec3 => [
  SG_TO_EQ_MATRIX[i * 3]!,
  SG_TO_EQ_MATRIX[i * 3 + 1]!,
  SG_TO_EQ_MATRIX[i * 3 + 2]!,
];

/** Frame-local → world equatorial-J2000 basis, one per orientation frame. */
export const ORIENTATION_FRAMES: Record<OrientationFrameId, Mat3> = {
  // Natural (+x, +y, +z) → (+x, +z, −y): equatorial pole +z into the middle.
  equatorial: mat3FromColumns([1, 0, 0], [0, 0, 1], [0, -1, 0]),
  // (xAxis, yAxis, normal) → (xAxis, normal, −yAxis): equinox +x stays col0.
  ecliptic: mat3FromColumns(ECLIPTIC_FRAME.xAxis, ECLIPTIC_FRAME.normal, neg(ECLIPTIC_FRAME.yAxis)),
  // (GAL_X, GAL_Y, GAL_Z) → (GAL_X, GAL_Z, −GAL_Y): NGP into the middle.
  galactic: mat3FromColumns(GAL_X_EQ, GAL_Z_EQ, neg(GAL_Y_EQ)),
  // (SGX, SGY, SGZ) → (SGX, SGZ, −SGY): the SG north pole (SGZ) into the middle.
  supergalactic: mat3FromColumns(sgCol(0), sgCol(2), neg(sgCol(1))),
};

/**
 * Each basis as a unit quaternion (x, y, z, w), derived once at module init from
 * the matrices above via the already-tested `matrixToQuaternion` (mirrors
 * `SG_TO_EQ_QUATERNION`). The slerp that consumes these lives in feature scope.
 */
export const ORIENTATION_FRAME_QUATERNIONS: Record<OrientationFrameId, Vec4> = {
  equatorial: matrixToQuaternion(ORIENTATION_FRAMES.equatorial),
  ecliptic: matrixToQuaternion(ORIENTATION_FRAMES.ecliptic),
  galactic: matrixToQuaternion(ORIENTATION_FRAMES.galactic),
  supergalactic: matrixToQuaternion(ORIENTATION_FRAMES.supergalactic),
};
