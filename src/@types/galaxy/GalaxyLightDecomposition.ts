/**
 * GalaxyLightDecomposition — how one galaxy's emitted light divides across the
 * four populations the analytic field builds. Fractions of the whole, summing
 * to exactly 1, so `GalaxyDescription.luminosity` times one of these IS what
 * that population emits — no per-population multiplier rides on top any more.
 *
 * `galaxyLightDecomposition` reads them off a Hubble-stage table;
 * `galaxyPopulationCountShares` runs them BACKWARDS through
 * `SPRITE_POPULATION_BRIGHTNESS` to get v1's star counts. Light is the physical
 * quantity, a count is a rendering budget, and that is the direction of travel.
 */
export type GalaxyLightDecomposition = {
  /**
   * B/T — Laurikainen et al. 2010 (MNRAS 405, 1089; arXiv:1002.4370 Table 2),
   * multi-component decompositions WITH the bar fitted, which is why they sit
   * at the low end of the published range: fitting a bar halves the inferred
   * B/T (that sample's own mean moved 0.55 -> 0.30, -> 0.25 once nuclear bars
   * were included). Two samples in two bands with the seam at T=1|2 — NIRS0S
   * in Ks for T=-3..1, OSUBSGS in H for T=2..9 — corrected for Galactic and
   * internal extinction. Near-IR, so roughly half these values in B for Sb and
   * later; the model does not render a band, so that is a known offset, not a
   * correction applied here.
   *
   * A barred galaxy gets the SAME row as an unbarred one of its stage: within
   * this sample barred and unbarred S0s have indistinguishable B/T (0.29+-0.02
   * vs 0.33+-0.03). Fitting a bar changes the measurement, not the galaxy.
   *
   * Per-galaxy scatter exceeds the trend along the sequence, and by design
   * there is no per-galaxy override (`GalaxyParams` deliberately carries no
   * `bulgeToTotal`; the survey-to-params map is where a measured T-type would
   * enter). M31 and M104 are both visibly bulge-heavier than their stage mean
   * and both get the stage mean.
   */
  readonly bulge: number;
  /**
   * Bar/T — Salo et al. 2015 (ApJS 219, 4), S4G Pipeline 4 Table 7 at 3.6 um,
   * human-supervised bulge/disc/bar/nucleus fits of 2352 galaxies, where the
   * published column is already a component's fraction of the total model
   * flux. Read off, not derived. The binning by Hubble stage is OURS, joined
   * through Buta et al. 2015 (ApJS 217, 32) mean stages — no paper tabulates
   * Bar/T against Hubble type.
   *
   * These are CONDITIONAL on a bar having been fitted, and this model spends
   * them that way: only the `barred` category builds bar geometry, so the
   * question is never "might this galaxy have a bar" but "how much light is in
   * the bar it has". A population average (multiply by the bin's bar-fitted
   * fraction — S0 0.43, Sa 0.59, Sb 0.44, Sbc 0.16, Sc 0.31, Sd 0.51/0.47)
   * would be wrong in both directions at once: it would under-light a bar we
   * know is there and light a bar that is not.
   *
   * Weinzirl et al. 2009 (ApJ 696, 411) runs 1.7x higher throughout on the
   * same H-band images the T>=2 B/T rows come from; he fits three components
   * and no lens, so his bar absorbs oval and lens light S4G assigns elsewhere.
   * Gadotti 2009 (MNRAS 393, 1531) sides with S4G.
   */
  readonly bar: number;
  /**
   * The remainder: 1 - bulge - bar - halo. A disc is what a galaxy is once its
   * spheroids and its bar are accounted for, so it is the one lane with no
   * measurement of its own and no rounding error.
   *
   * Arms are INSIDE this. `pushArmRidges` derives their flux from measured
   * arm/interarm contrast against the disc profile and debits the disc by
   * exactly what it adds (`GalaxyArmTuning.contrast`), so arms redistribute
   * disc light rather than carry a share of their own — and `armStrength`
   * cannot move any galaxy's light budget, only how the sprite tier spends
   * stars inside this lane.
   */
  readonly disc: number;
  /**
   * Halo/T, flat 2% (3% for the latest types). NOT a measurement by Hubble
   * type: no such measurement exists. Peters et al. 2017 (MNRAS 470, 427) is
   * the one study listing halo fraction alongside morphology and finds no
   * correlation, so a flat value is the honest reading of it.
   *
   * Do not "improve" this from the better-measured MASS fractions: Peters puts
   * halo M/L at ~3x the disc's while Harmsen corrects light to mass the other
   * way by 0.2 dex. They point in opposite directions and must not be averaged.
   */
  readonly halo: number;
};
