import type { GridBox } from '../grid/GridBox';

/** Everything one propagate + decay pair needs; parity selects the ping-pong side. */
export type McpmStep = {
  readonly propagatePipeline: GPUComputePipeline;
  readonly decayPipeline: GPUComputePipeline;
  readonly uniformBuffer: GPUBuffer;
  readonly uniformBindGroup: GPUBindGroup;
  /** Indexed by parity: [0] binds deposit = A, [1] binds deposit = B. */
  readonly propagateBindGroups: readonly [GPUBindGroup, GPUBindGroup];
  readonly decayBindGroups: readonly [GPUBindGroup, GPUBindGroup];
  readonly box: GridBox;
  readonly nDataPoints: number;
  readonly nAgents: number;
  readonly parity: 0 | 1;
  readonly iteration: number;
  /**
   * The histogram pass. Its group(0) is `uniformBindGroup` above, reused
   * as-is (histogram.wesl's header explains why it can't have its own
   * full-size uniform); group(1)/group(2) are STATIC (unlike propagate/decay's
   * ping-ponged pair) — neither trace, the agent lanes, nor the
   * histogram/densities buffers swap sides.
   */
  readonly histogramPipeline: GPUComputePipeline;
  readonly histogramFlagsBuffer: GPUBuffer;
  readonly histogramCountsBuffer: GPUBuffer;
  readonly histogramStorageBindGroup: GPUBindGroup;
  readonly histogramOwnBindGroup: GPUBindGroup;
};
