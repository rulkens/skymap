/**
 * GalaxyHiiDigTuning — the diffuse ionized gas (DIG) veil's own tunable
 * complex/children structure (`hiiRegions.ts`'s DIG block), nested under
 * `GalaxyHiiTuning` the way `GalaxyArmCloudTuning` nests under
 * `GalaxyArmTuning`. Replaces the flat `diffuse: number` this tier shipped
 * with (see `hiiRegions.ts` for the placement/scatter it drives).
 */
export type GalaxyHiiDigTuning = {
  /**
   * DIG's share of this tier's total Hα, observationally 30-50% of a
   * galaxy's Hα sitting outside HII regions entirely (Haffner+2009 review).
   * 0 = off, byte-identical to the veil never having run.
   */
  readonly fraction: number;
  /** Number of complex seeds the veil's blobs cluster around. */
  readonly complexes: number;
  /** Blobs per complex — total blob count is `complexes * childrenPerComplex`. */
  readonly childrenPerComplex: number;
  /**
   * 0..1 fraction of complexes seeded on an arm's lane (the same weighted
   * arm-flux placement `armParticleCloud.ts` uses) rather than CDF-sampled
   * from the SF map's `oldActivity` channel — "follow the arm flux" vs.
   * "follow where the map says gas has recently sat".
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
   * direction (the arm tangent on the arm-lane path, the azimuthal tangent
   * on the map-CDF path) — 1 follows it exactly, 0 rotates it to a fresh
   * random direction per complex.
   */
  readonly coherence: number;
};
