/**
 * Synthetic display photometry for the three DESI LSS clustering tracers
 * whose files carry no flux columns at all (LRG, ELG, QSO — verified
 * 2026-07-07 against live NGC headers; see `data/raw/desi/README.md`).
 * Only BGS_BRIGHT ships real `flux_g/r/z_dered` columns, so `parseDesiClustering`
 * computes BGS magnitudes from actual nanomaggy fluxes and falls back to this
 * table for the other three tracers.
 *
 * `absMagR` is the population's characteristic (Schechter M*-ish) r-band
 * absolute magnitude; `gMinusR` paints its colour class (red ellipticals for
 * LRG, blue star-formers for ELG, blue AGN continuum for QSO). Both are
 * display tuning knobs, not measured per-object photometry — every galaxy
 * of a given tracer at a given redshift renders with the *same* synthetic
 * magnitude, which is honest given the source data (positions + clustering
 * weights only) rather than fabricating a false precision.
 */
export const DESI_TRACER_DISPLAY: Record<
  'LRG' | 'ELG' | 'QSO',
  { absMagR: number; gMinusR: number }
> = {
  LRG: { absMagR: -22.8, gMinusR: 1.4 }, // massive red ellipticals
  ELG: { absMagR: -20.8, gMinusR: 0.5 }, // blue star-formers
  QSO: { absMagR: -25.5, gMinusR: 0.3 }, // AGN outshine hosts
};
