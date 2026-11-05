/**
 * GalaxyHiiDigTuning — the diffuse ionized gas (DIG) veil's own tunable
 * complex/children structure (`hiiRegions.ts`'s DIG block), nested under
 * `GalaxyHiiTuning` the way `GalaxyArmCloudTuning` nests under
 * `GalaxyArmTuning`. See `hiiRegions.ts` for the placement/scatter it drives.
 */
export type GalaxyHiiDigTuning = {
  /**
   * DIG's share of this tier's total Hα, observationally 30-50% of a
   * galaxy's Hα sitting outside HII regions entirely (Haffner+2009 review).
   * 0 = off, byte-identical to the veil never having run. A flux-SPLIT knob
   * — moves flux out of the shell tier's own total — not a gain; see
   * `brightness` below for the multiplicative one.
   */
  readonly fraction: number;
  /**
   * This tier's own flux GAIN, multiplied against `GalaxyHiiTuning.brightness`
   * (the whole-field master) — 1 leaves DIG at whatever the master alone
   * would give it. Distinct from `fraction`: that knob SPLITS flux out of
   * the shell tier's total, this one scales DIG's resulting share.
   */
  readonly brightness: number;
  /**
   * Scaler on the run's own recent-event population — the veil's complex
   * count is DERIVED from how much star formation the current run actually
   * produced (`hiiRegions.ts`'s `DIG_COMPLEXES_PER_EVENT`), not a fixed
   * number; 1 is the neutral default, 0 turns the veil off regardless of `fraction`.
   */
  readonly complexes: number;
  /** Blobs per complex — total blob count is `complexes * childrenPerComplex`. */
  readonly childrenPerComplex: number;
  /**
   * 0..1: concentrates map-seeded complexes toward the analytic arm
   * envelope (`hiiRegions.ts`'s `buildArmProximityEnvelope`) — a
   * reweighting of the SAME `activity` CDF every complex draws from, not
   * a second placement path. 0 = pure map density.
   */
  readonly armBias: number;
  /**
   * sigma_along / sigma_across of a complex's own child scatter, AREA
   * PRESERVING (`along = spread*sqrt(elongation)`, `across =
   * spread/sqrt(elongation)`) — the same convention `dustParticleCloud.ts`'s
   * S3 aspect uses, so growing this stretches a complex without also
   * inflating its footprint.
   */
  readonly elongation: number;
  /**
   * 0..1 how strictly a complex's scatter axis follows its local flow
   * direction (the azimuthal tangent every complex seeds against) — 1
   * follows it exactly, 0 rotates it to a fresh random direction per
   * complex.
   */
  readonly coherence: number;
  /**
   * 0..1+ how strongly this veil's blobs are modulated by the HII tier's
   * shared noise texture (`GalaxyHiiTuning.texture`'s own doc) — its own
   * per-group weight, independent of the shell tier's.
   */
  readonly texture: number;
};
