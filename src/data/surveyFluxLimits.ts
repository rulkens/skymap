/**
 * Per-survey flux limits and Schechter luminosity-function parameters.
 *
 * Used by the Malmquist-bias correction: the volume-limited and 1/V_max
 * modes need only `m_lim`; the Schechter density correction needs the
 * full Schechter triple `(M*, α, φ*)`.
 *
 * Sources:
 *   - SDSS:  Blanton et al. 2003, r-band LF for the spec sample.
 *            m_lim = 17.77 is the published spectroscopic completeness
 *            limit (SDSS DR1+).
 *   - 2MRS:  Huchra et al. 2012 catalogue (K_s ≤ 11.75); Kochanek et al.
 *            2001 K-band Schechter parameters from 2MASS.
 *   - GLADE: B-band parent samples (HyperLEDA, GWGC) with effective
 *            m_lim ≈ 18; Norberg et al. 2002 b_J Schechter parameters
 *            as a stand-in for B (close enough for visualisation).
 *   - Famous: hand-curated atlas of well-known galaxies. Has no real
 *            survey selection function — entries are picked by name, and
 *            their per-row photometry is mostly NaN (so vMaxWeight short-
 *            circuits to 0). We fall back to the SDSS calibration so the
 *            `Record<Source, ...>` shape is total without inventing
 *            values that pretend to mean something they don't.
 *
 * These values do not change between releases — they're properties of
 * each survey's selection function, not of any data we re-download —
 * so hard-coding them here is appropriate.
 */

import { Source } from './sources';
import type { SurveySource } from '../@types/data/SurveySource';
import type { SchechterTriple } from '../@types/data/SchechterTriple';

// Keyed by `SurveySource` (excludes POI codes) because flux limits and
// Schechter parameters only make sense for actual surveys with a
// selection function. POIs are pick-encoding-only markers.
const M_LIM: Record<SurveySource, number> = {
  [Source.SDSS]: 17.77,
  [Source.TwoMRS]: 11.75,
  [Source.Glade]: 18.0,
  [Source.Synthetic]: 17.77,
  [Source.Famous]: 17.77,
  // Milliquas's quasar-completeness limit varies wildly by parent
  // survey (SDSS DR16Q reaches r ~ 22, DESI EDR ~ 23, while bright
  // optical/X-ray-selected subsamples cut at ~18). For the bias
  // pipeline we use a permissive limit so vMaxWeight short-circuits
  // rather than upweighting an unphysical volume — Milliquas's true
  // selection function would need a per-parent-survey breakdown that
  // belongs in its own pass.
  [Source.Milliquas]: 22.0,
};

const SCHECHTER: Record<SurveySource, SchechterTriple> = {
  [Source.SDSS]: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  [Source.TwoMRS]: { mStar: -24.13, alpha: -1.1, phiStar: 0.0116 },
  [Source.Glade]: { mStar: -20.83, alpha: -1.08, phiStar: 0.0093 },
  [Source.Synthetic]: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  [Source.Famous]: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  // Quasars don't follow the galaxy Schechter LF — they have their
  // own QLF (Croom et al. 2009, Ross et al. 2013) with very different
  // parameters. Using the SDSS galaxy values here is a placeholder
  // for the shape; the renderer's vMaxWeight short-circuits to zero
  // for NaN-photometry rows so this rarely fires in practice. A
  // dedicated quasar LF is a separate plan.
  [Source.Milliquas]: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
};

/** Per-survey apparent-magnitude flux limit (band varies — see SCHECHTER). */
export function surveyFluxLimit(source: Source): number {
  if (source === Source.Cluster || source === Source.Supercluster || source === Source.Void) {
    throw new Error(`surveyFluxLimit: POI source ${source} has no flux limit`);
  }
  return M_LIM[source as SurveySource];
}

/** Per-survey Schechter triple for the band that defines the flux limit. */
export function surveySchechter(source: Source): SchechterTriple {
  if (source === Source.Cluster || source === Source.Supercluster || source === Source.Void) {
    throw new Error(`surveySchechter: POI source ${source} has no Schechter triple`);
  }
  return SCHECHTER[source as SurveySource];
}
