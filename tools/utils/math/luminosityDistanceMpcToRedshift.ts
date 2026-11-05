/**
 * Invert a luminosity distance to the redshift the pipeline's own flat-ΛCDM
 * places at that distance: `(1 + z) · redshiftToDistanceMpc(z) = dL`.
 * REGALADE's `Dist` is a luminosity distance (its `Dist / D_L(z)` is 0.99 on
 * every redshift source; `Dist / D_C(z)` drifts 10–30 % with z), so feeding
 * a `z` derived this way is what makes the renderer honour the catalog's
 * recommended distance rather than a cz distance of our own.
 * Illinois regula falsi on the bracket [D_C⁻¹(dL / (1 + hi)), D_C⁻¹(dL)]:
 * D_L ≥ D_C at every z, so the comoving inverse is an upper bound and the
 * same inverse of dL / (1 + hi) a lower one. ~6 forward evaluations per call.
 */

import { distanceMpcToRedshift } from '../../../src/utils/math/distanceMpcToRedshift';
import { redshiftToDistanceMpc } from '../../../src/utils/math/redshiftToDistanceMpc';

/** 0.1 kpc — far below the forward integral's own 1e-6 relative error. */
const D_TOLERANCE_MPC = 1e-4;
const MAX_ITERATIONS = 64;

function luminosityDistanceMpc(z: number): number {
  return (1 + z) * redshiftToDistanceMpc(z);
}

export function luminosityDistanceMpcToRedshift(dLMpc: number): number {
  if (!(dLMpc > 0)) return 0;
  let hi = distanceMpcToRedshift(dLMpc);
  let lo = distanceMpcToRedshift(dLMpc / (1 + hi));
  let fHi = luminosityDistanceMpc(hi) - dLMpc;
  let fLo = luminosityDistanceMpc(lo) - dLMpc;
  // Past the comoving inverse's z ceiling the bracket collapses onto it.
  if (fHi <= 0) return hi;
  if (fLo >= 0) return lo;

  let lastSide = 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const z = (lo * fHi - hi * fLo) / (fHi - fLo);
    const f = luminosityDistanceMpc(z) - dLMpc;
    if (Math.abs(f) < D_TOLERANCE_MPC) return z;
    if (f > 0) {
      hi = z;
      fHi = f;
      if (lastSide === 1) fLo /= 2;
      lastSide = 1;
    } else {
      lo = z;
      fLo = f;
      if (lastSide === -1) fHi /= 2;
      lastSide = -1;
    }
  }
  return (lo + hi) / 2;
}
