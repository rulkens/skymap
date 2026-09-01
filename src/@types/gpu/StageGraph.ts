import type { StagePhase } from './StagePhase';

export type StageGraph<Name extends string> = {
  /** Every stage of `phase`, in table order, each run iff wanted AND its key moved. */
  run(phase: StagePhase): void;
  /** Identity that changes each time `name` last ran — an effect edge, for a downstream stage's key. */
  token(name: Name): object;
};
