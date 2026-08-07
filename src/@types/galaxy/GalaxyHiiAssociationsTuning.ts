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
  /**
   * Scaler on the run's own mid-age-event population (task #10) — a complex
   * seeds directly off each mid-age SF event
   * (`resolveEventLifecyclePopulation`'s `midAgeSeeds`), so the count tracks
   * the run's own activity (`hiiRegions.ts`'s `ASSN_COMPLEXES_PER_EVENT`)
   * rather than a fixed number; 1 is the neutral default.
   */
  readonly complexes: number;
  /** Children per complex — total count is `complexes * childrenPerComplex`. */
  readonly childrenPerComplex: number;
  /**
   * 0..1(+) multiplier on the differential-rotation drift that carries a
   * complex downstream of the gas lane its own SF event was born in
   * (`sfEventAgeBands.ts`'s `driftedAssociationSeed`) — 0 leaves a complex
   * sitting exactly on its event's own gas-lane position, 1 is the drift the
   * shear formula computes exactly. Repurposed from a CDF-blend weight (see
   * `GalaxyHiiDigTuning.armBias`'s still-CDF-based version) now that
   * associations no longer draw from a density CDF at all.
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
