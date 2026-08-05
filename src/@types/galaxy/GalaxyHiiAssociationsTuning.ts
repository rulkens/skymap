/**
 * GalaxyHiiAssociationsTuning — the blue OB-association tier's own tunable
 * complex/children structure (`hiiRegions.ts`'s `buildBlueAssociations`),
 * nested under `GalaxyHiiTuning` the way `GalaxyHiiDigTuning` is. Once an
 * HII region's gas is expelled (~5 Myr) its embedded cluster stands exposed
 * and bare — visible ~50-100 Myr, several times more numerous than the
 * still-glowing HII knots that spawned them, and drifted clear of the
 * current SF front (docs/research/m74-jwst/).
 */
export type GalaxyHiiAssociationsTuning = {
  /**
   * Whole-tier flux multiplier, in the SAME currency the embedded OB
   * cluster's own sprites are drawn in (stellar continuum, not Hα) — 0 = off,
   * byte-identical to the tier never having run.
   */
  readonly brightness: number;
  /** Number of complex seeds the tier's children cluster around. */
  readonly complexes: number;
  /** Children per complex — total count is `complexes * childrenPerComplex`. */
  readonly childrenPerComplex: number;
  /**
   * 0..1: concentrates map-seeded complexes toward the analytic arm
   * envelope — same reweighting `GalaxyHiiDigTuning.armBias` applies, over
   * this tier's own `associationDensity` CDF instead of DIG's `oldActivity`
   * one.
   */
  readonly armBias: number;
  /** sigma_along / sigma_across of a complex's own child scatter, area-preserving — same convention `GalaxyHiiDigTuning.elongation` uses. */
  readonly elongation: number;
  /** 0..1 how strictly a complex's scatter axis follows its local flow direction — same convention `GalaxyHiiDigTuning.coherence` uses. */
  readonly coherence: number;
  /**
   * 0..1+ how strongly this tier's blobs are modulated by the HII tier's
   * shared noise texture — same convention `GalaxyHiiDigTuning.texture` uses,
   * its own per-group weight.
   */
  readonly texture: number;
};
