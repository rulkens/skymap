/**
 * Inverse of `redshiftToDistanceMpc`: given a line-of-sight comoving distance
 * in Mpc, return the redshift z that produces it under the same flat-ΛCDM
 * cosmology.
 *
 * The forward function is a numerical Simpson integral with no closed-form
 * inverse, so a naive bisection would re-evaluate the integral at every step
 * — ~2 500 sqrt+div per call, which destroys the per-galaxy hot paths in
 * `buildPointInterleavedBuffer` and `colourIndex`.
 *
 * Instead we precompute a Float32 lookup table at module load: 4 096
 * equally-spaced redshift samples in z ∈ [0, Z_MAX] paired with their
 * d_C values from the forward function.  Inversion is then a binary
 * search on the monotone distance column followed by linear interpolation
 * inside the bracketing pair — twelve comparisons, no transcendentals.
 *
 * The LUT-build cost is ~4 100 forward integrals ≈ 5 ms at module load,
 * paid once for the lifetime of the page.  The 16 KB LUT itself is
 * negligible.
 *
 * When `USE_LCDM_DISTANCES` is `false` the function short-circuits to the
 * closed-form linear-Hubble inverse and never touches the LUT — flipping
 * the flag is still a one-line edit.
 */

import { HUBBLE_DISTANCE_MPC, USE_LCDM_DISTANCES } from './constants';
import { redshiftToDistanceMpc } from './redshiftToDistanceMpc';

/**
 * Upper bound on the LUT's z range.  z = 12 corresponds to a ΛCDM comoving
 * distance > 9 Gpc — well beyond anything in our catalogs (Milliquas tails
 * at z ≈ 7).  A distance past `LUT_D[LUT_N]` saturates at `Z_MAX`, which
 * is the right behaviour: such a position is past the physical horizon and
 * shouldn't have come from a real survey row.
 */
const Z_MAX = 12;

/**
 * LUT resolution.  4 096 entries over z ∈ [0, 12] gives Δz ≈ 0.003 between
 * samples; with linear interpolation that's a relative error of order 1e-7
 * for the inverse — well below the forward Simpson integral's own 1e-6
 * error budget.
 */
const LUT_N = 4096;
const LUT_DZ = Z_MAX / LUT_N;

/**
 * `LUT_D[i] = redshiftToDistanceMpc(i * LUT_DZ)`.  Float32 is plenty —
 * 7 decimal digits of mantissa, the integrand is smooth so adjacent
 * entries differ in the 4th–5th digit at most.
 *
 * The table is built lazily on the first call (rather than at module-eval
 * time) so test environments that import the module without exercising
 * the function don't pay the build cost.
 */
let LUT_D: Float32Array | null = null;

function ensureLut(): Float32Array {
  if (LUT_D !== null) return LUT_D;
  const lut = new Float32Array(LUT_N + 1);
  for (let i = 0; i <= LUT_N; i++) {
    lut[i] = redshiftToDistanceMpc(i * LUT_DZ);
  }
  LUT_D = lut;
  return lut;
}

/**
 * Comoving distance in Mpc → redshift z, inverted via a precomputed
 * forward-curve LUT (binary search + linear interpolation).
 *
 * Returns 0 for d ≤ 0.  Saturates at `Z_MAX` for distances beyond the
 * top of the LUT.
 */
export function distanceMpcToRedshift(dMpc: number): number {
  if (dMpc <= 0) return 0;
  if (!USE_LCDM_DISTANCES) return dMpc / HUBBLE_DISTANCE_MPC;

  const lut = ensureLut();
  if (dMpc >= lut[LUT_N]!) return Z_MAX;

  // Binary search for the bracket [lo, lo+1] where lut[lo] <= d < lut[lo+1].
  let lo = 0;
  let hi = LUT_N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (lut[mid]! <= dMpc) lo = mid;
    else hi = mid;
  }
  // Linear interpolation inside the bracket.  Safe to divide because the
  // forward function is strictly monotone — adjacent samples never tie.
  const dLo = lut[lo]!;
  const dHi = lut[hi]!;
  const t = (dMpc - dLo) / (dHi - dLo);
  return (lo + t) * LUT_DZ;
}
