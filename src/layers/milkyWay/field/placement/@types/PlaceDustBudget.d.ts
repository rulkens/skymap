export type PlaceDustBudget = {
  /** Reserved slot count — `fieldPack`'s dust range sizes off this, not off any placed particle. */
  readonly count: number;
  readonly childrenPerComplex: number;
  readonly complexSpread: number;
  readonly elongation: number;
  readonly sigmaZComplex: number;
  readonly discWeightSum: number;
  readonly discSigmaR: readonly [number, number, number, number];
  readonly sizeMin: number;
  readonly sizeMax: number;
  readonly extinctionRgb: readonly [number, number, number];
  /**
   * `dust.tau`'s entire measured column, expressed as a MASS total —
   * `dustParticleCloud.ts:287`'s `totalMass = dust.tau * 2*PI*weightedSigma2`,
   * a pure function of geometry/tuning with no placement dependency (unlike
   * `sumR2`, which only exists after particles land). `ringReduce.wesl`'s
   * survivor-sum kernel divides this by the GPU-computed `sumR2` to get
   * `massPerR2` — see that kernel's own doc.
   */
  readonly totalMass: number;
};
