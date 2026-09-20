export type DispatchSurvivorSumInput = {
  /** placeDust.wesl's own massOut buffer (`IsmMapPlaceDust.massBuffer`) — producer-owned, passed in fresh each call since its identity never changes but this module has no constructor-time reference to it. */
  readonly massBuffer: GPUBuffer;
  /** This rebuild's dust particle count — `PlaceDustBudget.count`, NOT `MAX_PARTICLE_COUNT`: massBuffer beyond it holds a previous dispatch's stale values. */
  readonly count: number;
  /** `PlaceDustBudget.totalMass` — dustParticleCloud.ts:287's own totalMass, pure geometry/tau function computed CPU-side. */
  readonly totalMass: number;
};
