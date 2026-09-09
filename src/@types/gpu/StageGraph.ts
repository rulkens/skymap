import type { StagePhase } from './StagePhase';

export type StageGraph<Name extends string, Ctx = void> = {
  /**
   * Every stage of `phase`, in table order, each run iff wanted AND its
   * effective key — its after-edges' tokens followed by its own key — moved.
   */
  run(phase: StagePhase, ctx: Ctx): void;
};
