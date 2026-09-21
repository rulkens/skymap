export type DigVeilBudget = {
  /** Reserved slot count (`complexes * childrenPerComplex`) — `hiiPack`'s DIG span sizes off this, not off any placed particle. */
  readonly count: number;
  readonly childrenPerComplex: number;
  readonly complexSpread: number;
  readonly elongation: number;
  readonly coherence: number;
  /** `digTotalFlux / totalChildren` — every child's amplitude is this divided by its own `TAU_ROOT3 * sigma^3`. */
  readonly amplitudeBase: number;
  readonly color: readonly [number, number, number];
  readonly textureWeight: number;
  readonly scaleHeight: number;
  readonly sigmaMin: number;
  readonly sigmaMax: number;
};
