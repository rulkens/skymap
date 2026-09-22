/**
 * PlanResult — what a `ContentPlanner.plan` call hands back: the planned
 * value plus two independent votes, `awake` ⊇ `settling` by convention (never
 * the converse — content that animates forever keeps the loop awake without
 * ever staling a bake). `runFrame` ORs every result's bits into the
 * scheduler's keep-ticking vote; `scheduleSkyCaptures` reads the settling
 * fold alone.
 */

export type PlanResult<T> = {
  readonly value: T;
  readonly awake: boolean;
  readonly settling: boolean;
};
