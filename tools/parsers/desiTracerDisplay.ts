/**
 * Synthetic display photometry for the three DESI LSS clustering tracers
 * whose files carry no flux columns at all (LRG, ELG, QSO — verified
 * against the live NGC headers; see `data/raw/desi/README.md`).
 * Only BGS_BRIGHT ships real `flux_g/r/z_dered` columns, so `parseDesiClustering`
 * computes BGS magnitudes from actual nanomaggy fluxes and falls back to this
 * table for the other three tracers.
 *
 * `absMagR` is a DISPLAY-FLATTENING knob, not a physical M*: it is tuned
 * against the *measured* rendered per-segment mean-intensity profile of the
 * built bin so the four tracer bands don't render as brightness cliffs. The
 * tracer boundaries are redshift cuts, so a per-tracer absolute magnitude that
 * differs from its neighbours draws a straight-edged brightness step across the
 * cone. Physically-honest values were the alternative and were rejected: at
 * ELG M ≈ −20.8 the ELG-dominated 2.75–4.5 Gpc stretch renders ~3× dimmer than
 * its BGS/LRG/QSO flanks (mean intensity ≈ 0.21 vs ≈ 0.5–0.75), painting a
 * sharp-edged dim block into the middle of the cone. Raising LRG and ELG (and
 * accounting for the whole-source mean-magnitude normalisation feedback)
 * flattens the profile to a gentle monotone (~0.65 → 0.39 across the galaxy
 * cone) with only a modest step into the sparse quasar tail. `gMinusR` paints
 * each tracer's colour class (red ellipticals for LRG, blue star-formers for
 * ELG, blue AGN continuum for QSO).
 *
 * These are safe as pure display knobs because the InfoCard suppresses the
 * synthetic magnitude for LRG/ELG/QSO rows (only BGS ships real fluxes), so no
 * tuned value can masquerade as a measurement. Every galaxy of a given tracer
 * at a given redshift renders with the *same* synthetic magnitude — honest
 * given the source data (positions + clustering weights only) rather than
 * fabricating a false per-object precision.
 */
export const DESI_TRACER_DISPLAY: Record<
  'LRG' | 'ELG' | 'QSO',
  { absMagR: number; gMinusR: number }
> = {
  LRG: { absMagR: -24.3, gMinusR: 1.4 }, // massive red ellipticals
  ELG: { absMagR: -24.0, gMinusR: 0.5 }, // blue star-formers
  QSO: { absMagR: -25.5, gMinusR: 0.3 }, // AGN outshine hosts
};
