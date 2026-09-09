import type { StagePhase } from './StagePhase';

export type Stage<Name extends string, Ctx = void> = {
  readonly name: Name;
  readonly phase: StagePhase;
  /**
   * Stages this one must run AFTER — the DAG's edges, declared, AND the
   * re-run edge: their tokens are prepended to this stage's own `key(ctx)`.
   * Validated against table order at construction.
   */
  readonly after: readonly Name[];
  /** Consumer liveness, the `createKeyedRebuild` axis. Omitted = always wanted. */
  readonly wanted?: (ctx: Ctx) => boolean;
  /** This stage's own inputs, element-wise `Object.is` (same semantics as `createDerived`). */
  readonly key: (ctx: Ctx) => readonly unknown[];
  readonly run: (ctx: Ctx) => void;
};
