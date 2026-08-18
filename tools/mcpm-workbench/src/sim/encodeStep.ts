import type { GridBox } from '../../@types/GridBox';
import type { McpmParams } from '../../@types/McpmParams';
import { UNIFORM_BYTES } from './createGridBuffers';

/**
 * The fork dispatches propagate as `run_compute(10, 10, grid_z)` with
 * `grid_z = ((active_agents + data_count) / 100) / THREAD_GROUP_SIZE`
 * (main.cpp:205, :1121, :1122) — both divisions are C integer division, so
 * the covered invocation count truncates to whole multiples of 100,000,
 * dropping a tail of up to 99,999 items. Kept ON for fidelity; OFF covers
 * every item with a ceil over the same (10, 10, z) shape. Either way the
 * dispatch is fork-exact in SHAPE: propagate.wesl:60-61's `groupIdx`
 * linearises `groupId.x + groupId.y*nGroups.x + groupId.z*nGroups.x*nGroups.y`,
 * a bijection under any dispatch shape, and the kernel's idx guard makes any
 * size safe.
 */
export const QUIRK_DISPATCH_TRUNCATION = true;

const PROPAGATE_DISPATCH_X = 10; // main.cpp:1122 — run_compute(10, 10, grid_z)
const PROPAGATE_DISPATCH_Y = 10;
const PROPAGATE_INVOCATIONS_PER_GROUP = 1000; // main.cpp:205 THREAD_GROUP_SIZE
const DECAY_WG_EDGE = 8; // constants.wesl DECAY_WG_* — dims are multiples of 8

const DEG_TO_RAD = Math.PI / 180;

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
   * T20: the histogram pass. Its group(0) is `uniformBindGroup` above, reused
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

/**
 * encodeStep — one simulation iteration: propagate over the agents, then decay
 * over the grid, then the T20 histogram pass over the (now-decayed) trace, in
 * that order (main.cpp:1105, 1159, 1178). All three dispatches share one
 * compute pass; WebGPU orders dispatches within a pass, so decay cannot
 * observe a half-written deposit field, and the histogram pass reads the
 * SAME trace values decay just wrote in place.
 *
 * This is also the Mpc → voxel / degrees → radians boundary: the shaders never
 * see either human unit.
 */
export function encodeStep(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  step: McpmStep,
  params: McpmParams,
  sampleRandomly: boolean,
): void {
  const { box } = step;
  const uniforms = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(uniforms);
  const i32 = new Int32Array(uniforms);
  f32[0] = params.senseSpreadDeg * DEG_TO_RAD;
  f32[1] = params.senseDistanceMpc / box.voxelSizeMpc;
  f32[2] = params.turnAngleDeg * DEG_TO_RAD;
  f32[3] = params.moveDistanceMpc / box.voxelSizeMpc;
  f32[4] = params.depositValue;
  f32[5] = params.persistence;
  f32[6] = 0; // centerAttraction — pinned to 0 by the fork (main.cpp:805)
  i32[7] = box.dims[0];
  i32[8] = box.dims[1];
  i32[9] = box.dims[2];
  f32[10] = params.sharpness;
  f32[11] = params.normalizationFactor;
  i32[12] = step.nDataPoints;
  i32[13] = step.nAgents;
  i32[14] = step.iteration;
  i32[15] = 0;
  device.queue.writeBuffer(step.uniformBuffer, 0, uniforms);

  // T20's own tiny uniform — everything else the histogram pass needs (nDataPoints,
  // world dims) is already in the McpmUniforms write above; group(0) reuses it as-is.
  device.queue.writeBuffer(step.histogramFlagsBuffer, 0, new Int32Array([sampleRandomly ? 1 : 0]));
  // main.cpp zeroes density_histogram every frame it samples (1181-1184), then dispatches:
  // each step's counts are one point-in-time snapshot, never a running total across steps.
  // clearBuffer is an encoder-level command — must run before the compute pass begins.
  encoder.clearBuffer(step.histogramCountsBuffer);

  const items = step.nDataPoints + step.nAgents;
  // main.cpp:1121 — ((active_agents + data_count) / 100) / THREAD_GROUP_SIZE, both C
  // integer divisions: the dispatch covers 100_000 * floor(items / 100_000) items and
  // the tail (up to 99,999) never runs. Equivalent to Math.floor(items / 100_000).
  // createMcpmHarness enforces items >= 100_000 before any GPU work, so gridZ >= 1 always.
  const gridZ = QUIRK_DISPATCH_TRUNCATION
    ? Math.floor(Math.floor(items / 100) / PROPAGATE_INVOCATIONS_PER_GROUP)
    : Math.ceil(
        items / (PROPAGATE_DISPATCH_X * PROPAGATE_DISPATCH_Y * PROPAGATE_INVOCATIONS_PER_GROUP),
      );

  const pass = encoder.beginComputePass({ label: 'mcpm-step' });
  pass.setBindGroup(0, step.uniformBindGroup);

  pass.setPipeline(step.propagatePipeline);
  pass.setBindGroup(1, step.propagateBindGroups[step.parity]);
  pass.dispatchWorkgroups(PROPAGATE_DISPATCH_X, PROPAGATE_DISPATCH_Y, gridZ);

  pass.setPipeline(step.decayPipeline);
  pass.setBindGroup(1, step.decayBindGroups[step.parity]);
  pass.dispatchWorkgroups(
    box.dims[0] / DECAY_WG_EDGE,
    box.dims[1] / DECAY_WG_EDGE,
    box.dims[2] / DECAY_WG_EDGE,
  );

  // T20: main.cpp recomputes grid_z with the identical formula for this pass (its own
  // 'active_agents + data_count' quantity), so it shares propagate's dispatch shape and
  // gridZ exactly — the kernel's own idx guard makes the (mostly-idle) coverage safe.
  pass.setPipeline(step.histogramPipeline);
  pass.setBindGroup(0, step.uniformBindGroup); // group(0) is McpmUniforms, reused as-is
  pass.setBindGroup(1, step.histogramStorageBindGroup);
  pass.setBindGroup(2, step.histogramOwnBindGroup);
  pass.dispatchWorkgroups(PROPAGATE_DISPATCH_X, PROPAGATE_DISPATCH_Y, gridZ);

  pass.end();
}
