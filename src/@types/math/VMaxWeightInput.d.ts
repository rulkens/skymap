/**
 * VMaxWeightInput — input to the per-galaxy 1/V_max weight
 * (`src/utils/math/vMaxWeight.ts:vMaxWeight`), Schmidt 1968.
 *
 * Carries the galaxy's absolute magnitude, the galaxy catalog's apparent-magnitude
 * flux limit, and the reference distance defining the normalising volume.
 * See the runtime function's docblock for the rationale behind the
 * clipped-cubed-ratio formula.
 */
export type VMaxWeightInput = {
  /** Absolute magnitude of the galaxy in the galaxy catalog's flux-limit band. */
  absMag: number;
  /** Galaxy catalog's apparent-magnitude flux limit (e.g. SDSS m_r ≈ 17.77). */
  mLim: number;
  /** Reference distance (Mpc) defining the normalising volume. */
  dRefMpc: number;
};
