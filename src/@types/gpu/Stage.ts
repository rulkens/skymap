import type { StagePhase } from './StagePhase';

export type Stage<Name extends string> = {
  readonly name: Name;
  readonly phase: StagePhase;
  /** Stages this one must run AFTER — the DAG's edges, declared. Validated against table order at construction. */
  readonly after: readonly Name[];
  /** Consumer liveness, the `createKeyedRebuild` axis. Omitted = always wanted. */
  readonly wanted?: () => boolean;
  /** This stage's inputs, element-wise `Object.is` (same semantics as `createDerived`). */
  readonly key: () => readonly unknown[];
  readonly run: () => void;
};
