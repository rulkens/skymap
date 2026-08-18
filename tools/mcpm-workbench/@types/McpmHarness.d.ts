import type { GridBox } from './GridBox';
import type { GridElement } from './GridElement';
import type { AgentInitMode } from './AgentInitMode';
import type { McpmParams } from './McpmParams';
import type { GpuContext } from '../../../src/@types/rendering/GpuContext';

/**
 * McpmHarness — the stepping MCPM simulation: GPU buffers, pipelines and the
 * propagate → decay encode. `element` is decided by the device's shader-f16
 * support alone, so the flag and the device can never disagree.
 */
export type McpmHarness = {
  readonly element: GridElement;
  readonly box: GridBox;
  /**
   * The device the harness allocated via `initGpu`. T10's render passes and
   * T11's viewport must consume this rather than calling `initGpu` again on
   * the same canvas — a second call reconfigures the swap chain and would
   * hand the render passes a device without the compute limits the kernels
   * need (see task-T9-review.md concern 4).
   */
  readonly gpu: GpuContext;
  /**
   * The trace grid the render passes march. Stays the harness's to destroy —
   * a consumer that outlives a rebuild must re-read it from the new harness.
   */
  readonly traceBuffer: GPUBuffer;
  /** Queues one propagate + decay pair and advances the step counter. */
  step(params: McpmParams): void;
  /** Zeroes the trace grid only; agents and deposit survive. */
  clearTrace(): void;
  /** Re-seeds agents and zeroes every grid; resets the step counter. */
  reset(mode: AgentInitMode, seed: number): void;
  dispose(): void;
};
