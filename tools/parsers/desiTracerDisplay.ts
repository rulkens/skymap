/**
 * Synthetic display photometry for the three DESI LSS clustering tracers
 * whose files carry no flux columns at all (LRG, ELG, QSO — verified
 * against the live NGC headers; see `data/raw/desi/README.md`).
 * Only BGS_BRIGHT ships real `flux_g/r/z_dered` columns, so `parseDesiClustering`
 * computes BGS magnitudes from actual nanomaggy fluxes and falls back to this
 * table for the other three tracers.
 *
 * `absMagR` is the characteristic absolute magnitude of each tracer
 * population (LRG: massive red ellipticals near M*; ELG: blue star-forming
 * dwarfs/spirals, intrinsically fainter; QSO: AGN continuum outshines the
 * host galaxy by several magnitudes) — a physically-motivated per-tracer
 * constant, not a display fit. `gMinusR` paints each tracer's colour class
 * (red ellipticals for LRG, blue star-formers for ELG, blue AGN continuum
 * for QSO).
 *
 * A display-flattening retune was tried and rejected. The idea: raise LRG
 * to −24.3 and ELG to −24.0 (both well past any physical M*) so the four
 * tracer bands render at roughly equal mean per-segment intensity instead
 * of the honest values' brightness steps — the tracer boundaries are
 * redshift cuts, so any per-tracer magnitude that differs from its
 * neighbours draws a step across the cone, and at the physical ELG M ≈
 * −20.8 the ELG-dominated 2.75–4.5 Gpc stretch renders visibly dimmer than
 * its BGS/LRG/QSO flanks. But the renderer normalises brightness against
 * the whole source's mean magnitude, so pushing LRG/ELG brighter to lift
 * the dim ELG middle pays for it by dimming the rest of the cone: the vivid
 * BGS near field dropped from ≈0.83 to ≈0.66 mean intensity and the far
 * quasar tail from ≈0.46 to ≈0.28 at 6.5 Gpc. Compared live, the flattened
 * profile reads as washed-out and loses the cone's dramatic depth falloff;
 * the honest profile's dim ELG stretch is the survey's real selection
 * function (ELGs are intrinsically faint) and is accepted as-is rather than
 * papered over.
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
  LRG: { absMagR: -22.8, gMinusR: 1.4 }, // massive red ellipticals
  ELG: { absMagR: -20.8, gMinusR: 0.5 }, // blue star-formers
  QSO: { absMagR: -25.5, gMinusR: 0.3 }, // AGN outshine hosts
};
