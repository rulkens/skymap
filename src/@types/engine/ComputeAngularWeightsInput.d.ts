import type { GalaxyCatalog } from '../data/GalaxyCatalog';
import type { Source } from '../../data/sources';

export type ComputeAngularWeightsInput = {
  /** Galaxy catalog whose galaxies need per-row angular re-weight values. */
  cloud: GalaxyCatalog;
  /**
   * Survey this catalog belongs to.  Currently unused by the algorithm — the
   * binning is purely geometric on the catalog's positions — but threaded
   * through the API for parity with `computeSchechterRatios` and to support
   * a future per-survey tuning (e.g., different `nside` for the smaller 2MRS
   * catalog where 12 288 cells overresolve the data).
   */
  source: Source;
  /**
   * Lower clamp for the per-galaxy weight.
   *
   * Defaults to 0.3 (visualisation-tuned: dim-heavy, additive-blending
   * tolerant — see `WEIGHT_MIN` rationale above).  Override e.g. to 1.0
   * for build-time point-duplication use where amplification > 1× is needed
   * and dimming below 1× is impossible (you can't emit half a copy of a
   * galaxy via integer duplication).
   */
  weightMin?: number;
  /**
   * Upper clamp for the per-galaxy weight.
   *
   * Defaults to 1.2 (visualisation-tuned, see `WEIGHT_MAX` rationale above).
   * Override e.g. to 15 for build-time point-duplication use, matching the
   * Malmquist V_max `WEIGHT_CAP` so the combined V_max × angular weight
   * stays within a sensible duplication budget.
   */
  weightMax?: number;
};
