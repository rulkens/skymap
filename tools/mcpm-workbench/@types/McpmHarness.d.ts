import type { GridBox } from './GridBox';
import type { GridElement } from './GridElement';
import type { AgentInitMode } from './AgentInitMode';
import type { McpmParams } from './McpmParams';

/**
 * McpmHarness — the stepping MCPM simulation: GPU buffers, pipelines and the
 * propagate → decay encode. `element` is decided by the device's shader-f16
 * support alone, so the flag and the device can never disagree.
 */
export type McpmHarness = {
  readonly element: GridElement;
  readonly box: GridBox;
  /** Queues one propagate + decay pair and advances the step counter. */
  step(params: McpmParams): void;
  /** Zeroes the trace grid only; agents and deposit survive. */
  clearTrace(): void;
  /** Re-seeds agents and zeroes every grid; resets the step counter. */
  reset(mode: AgentInitMode, seed: number): void;
  dispose(): void;
};
