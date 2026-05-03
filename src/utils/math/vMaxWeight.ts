/**
 * Per-galaxy 1/V_max weight for Malmquist-bias correction (Schmidt 1968).
 *
 * Concept: each catalogued galaxy is the *one we see*, but it represents
 * a population of similar galaxies — many of which we'd see if they were
 * within `d_max`, the maximum distance at which a galaxy of this intrinsic
 * brightness could still pass the survey's flux limit.  The proper
 * unbiased weighting is `1 / V_max` where `V_max ∝ d_max³`.
 *
 * For visualisation we don't want unbounded weights (intrinsically faint
 * galaxies have tiny V_max and would saturate the alpha to 1 in a
 * cluster, while bright galaxies would vanish).  We normalise by a
 * reference volume `V_ref ∝ dRefMpc³` so the returned weight is roughly
 * "fraction of the reference volume in which this galaxy is detectable":
 *
 *     weight = clamp((d_max / dRef)³, 0, 1)         (then inverted below)
 *
 * Wait — that's V_max / V_ref, the WRONG direction.  We actually return
 * the reciprocal `(dRef / d_max)³` because the visualisation wants
 * faint-but-rare galaxies to render *more* prominently (representing
 * the many we can't see), not less.  But we clip at 1: if V_max is
 * already smaller than V_ref, we don't apply a bonus — the galaxy is
 * already representative of its slice of the reference volume.
 *
 * Returns 0 for NaN absolute magnitude (galaxies with missing
 * photometry) so the caller can identity-multiply by the weight without
 * special-casing.
 */

import { dMaxFromAbsolute } from './distanceModulus';

export type VMaxWeightInput = {
  /** Absolute magnitude of the galaxy in the survey's flux-limit band. */
  absMag: number;
  /** Survey's apparent-magnitude flux limit (e.g. SDSS m_r ≈ 17.77). */
  mLim: number;
  /** Reference distance (Mpc) defining the normalising volume. */
  dRefMpc: number;
};

export function vMaxWeight(input: VMaxWeightInput): number {
  const { absMag, mLim, dRefMpc } = input;
  if (!Number.isFinite(absMag)) return 0;
  const dMax = dMaxFromAbsolute(absMag, mLim);
  if (!Number.isFinite(dMax) || dMax <= 0) return 0;
  // V_ref / V_max = (dRefMpc / dMax)³.  We render this as (dRef/dMax)³
  // clipped to [0, 1] so the alpha multiplier never exceeds the un-
  // weighted alpha (i.e. we only ever DIM a galaxy, never brighten it).
  // Bright galaxies (large dMax) → ratio < 1 → small weight (rendered
  // dimmer).  Faint galaxies (small dMax < dRef) → ratio > 1 → clipped
  // to 1 (rendered at full strength).
  const ratio = dRefMpc / dMax;
  const weight = ratio * ratio * ratio;
  return Math.min(1, weight);
}
