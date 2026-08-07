/**
 * GalaxyHiiAssociationsTuning — the blue OB-association tier's own tunable
 * population/shape knobs (`hiiRegions.ts`'s `buildBlueAssociations`), nested
 * under `GalaxyHiiTuning` the way `GalaxyHiiDigTuning` is. Once an HII
 * region's gas is expelled (~5 Myr) its embedded cluster stands exposed and
 * bare — visible ~50-100 Myr, several times more numerous than the
 * still-glowing HII knots that spawned them, and drifted clear of the
 * current SF front (docs/research/m74-jwst/).
 *
 * SINGLE SPLAT PER SEED (task #20): no `childrenPerComplex` here the way
 * `GalaxyHiiDigTuning` has one — a scattered-children swarm existed to fake
 * extent and grain through particle count, redundant now that the HII
 * texture's own star-grain volume (`splat.wesl`'s `starGrainTerm`) supplies
 * the grain per-fragment. One anisotropic splat per admitted seed instead.
 */
export type GalaxyHiiAssociationsTuning = {
  /**
   * Whole-tier flux multiplier, in the SAME currency the embedded OB
   * cluster's own sprites are drawn in (stellar continuum, not Hα) — 0 = off,
   * byte-identical to the tier never having run.
   */
  readonly brightness: number;
  /**
   * Scaler on the run's own mid-age-event population (task #10) — a splat
   * seeds directly off each mid-age SF event
   * (`resolveEventLifecyclePopulation`'s `midAgeSeeds`), so the count tracks
   * the run's own activity (`hiiRegions.ts`'s `ASSN_COMPLEXES_PER_EVENT`)
   * rather than a fixed number; 1 is the neutral default.
   */
  readonly complexes: number;
  /**
   * 0..1(+) multiplier on the differential-rotation drift that carries a
   * splat downstream of the gas lane its own SF event was born in
   * (`sfEventAgeBands.ts`'s `driftedAssociationSeed`) — 0 leaves a splat
   * sitting exactly on its event's own gas-lane position, 1 is the drift the
   * shear formula computes exactly. Repurposed from a CDF-blend weight (see
   * `GalaxyHiiDigTuning.armBias`'s still-CDF-based version) now that
   * associations no longer draw from a density CDF at all.
   */
  readonly armBias: number;
  /**
   * sigma_along / sigma_across of the SPLAT's own covariance (task #20),
   * area-preserving, stretched along its seed's local drift/flow direction —
   * same convention `GalaxyHiiDigTuning.elongation` uses for its child
   * scatter, now describing the splat's own shape instead.
   */
  readonly elongation: number;
  /** 0..1 how strictly a splat's own along/across axes follow its local flow direction — same convention `GalaxyHiiDigTuning.coherence` uses. */
  readonly coherence: number;
  /**
   * 0..1+ how strongly this tier's splats are modulated by the HII tier's
   * star-grain noise texture — same convention `GalaxyHiiDigTuning.texture`
   * uses, its own per-group weight.
   */
  readonly texture: number;
  /**
   * Multiplier on the splat's own sigma draw (`hiiRegions.ts`'s
   * `ASSN_SIGMA_MIN/MAX_PC` range) — board 21: coverage is count x area, and
   * `complexes` alone only ever grew the count. Area goes as this knob's
   * SQUARE (a Gaussian footprint scales with sigma in both in-plane axes at
   * once), so it is a much cheaper coverage lever than `complexes`. 1 is the
   * law exactly; `?? 1` at the point of use is the stale-stored-tuning guard
   * every other `hii.*` knob added after launch already carries.
   */
  readonly sizeScale: number;
};
