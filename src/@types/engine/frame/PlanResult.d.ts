/**
 * PlanResult — what a `ContentPlanner.plan` call hands back: the planned
 * value plus the two `LayerFrameVote` bits (`awake` ⊇ `settling` by the same
 * convention). `runFrame` ORs every put result's bits into the scheduler's
 * keep-ticking vote; `scheduleSkyCaptures` reads the settling fold alone.
 */

export type PlanResult<T> = {
  readonly value: T;
  readonly awake: boolean;
  readonly settling: boolean;
};
