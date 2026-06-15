/**
 * GalaxyCatalogConstants — pure-function-of-Source cached values used by the
 * bias-correction subsystem and the renderer.
 *
 * See `src/services/biasCorrection/galaxyCatalogConstants.ts` for the runtime
 * table (built eagerly at module init) and the rationale behind eager
 * pre-computation of `nRef`.
 */

import type { SchechterTriple } from '../data/galaxyCatalog/SchechterTriple';

export type GalaxyCatalogConstants = {
  /** Schechter LF triple `(M*, α, φ*)` for the band defining the flux limit. */
  schechter: SchechterTriple;
  /** Apparent-magnitude flux limit (e.g. SDSS = 17.77, 2MRS = 11.75). */
  mLim: number;
  /** Central-density normaliser n(d = 10 Mpc), pre-computed once. */
  nRef: number;
};
