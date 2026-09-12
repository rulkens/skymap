/**
 * eyeRelativeOrbitBasisKm — one orbit's 3D ellipse basis as three padded
 * vec4s at `out[at..at+12)`, for the conic fragment's occlusion test, which
 * rebuilds the orbit point behind a pixel as `centre + s·A + t·B`.
 *
 * The eye is subtracted in f64 Mpc BEFORE the unit change — the seam
 * `bodyRelativePose` relies on: the shared heliocentric magnitude cancels
 * first, then only the remainder is scaled. Kilometres because eye-relative
 * Mpc magnitudes are denormal in f32 and some GPUs flush them to zero.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';

const MPC_TO_KM = SCALE_UNITS.MPC_TO_M * SCALE_UNITS.M_TO_KM;

export function eyeRelativeOrbitBasisKm(
  input: {
    readonly eyeMpc: Readonly<Vec3>;
    readonly centerMpc: Readonly<Vec3>;
    readonly semiMajorMpc: Readonly<Vec3>;
    readonly semiMinorMpc: Readonly<Vec3>;
  },
  out: Float32Array,
  at: number,
): void {
  const { eyeMpc, centerMpc, semiMajorMpc, semiMinorMpc } = input;
  out[at] = (centerMpc[0] - eyeMpc[0]) * MPC_TO_KM;
  out[at + 1] = (centerMpc[1] - eyeMpc[1]) * MPC_TO_KM;
  out[at + 2] = (centerMpc[2] - eyeMpc[2]) * MPC_TO_KM;
  out[at + 4] = semiMajorMpc[0] * MPC_TO_KM;
  out[at + 5] = semiMajorMpc[1] * MPC_TO_KM;
  out[at + 6] = semiMajorMpc[2] * MPC_TO_KM;
  out[at + 8] = semiMinorMpc[0] * MPC_TO_KM;
  out[at + 9] = semiMinorMpc[1] * MPC_TO_KM;
  out[at + 10] = semiMinorMpc[2] * MPC_TO_KM;
}
