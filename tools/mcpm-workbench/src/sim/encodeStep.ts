import type { GridBox } from '../../@types/GridBox';
import type { McpmParams } from '../../@types/McpmParams';

/**
 * The fork's propagate dispatch truncates: main.cpp:1121 computes
 * `((active_agents + data_count) / 100) / THREAD_GROUP_SIZE` in integer
 * arithmetic, so a tail of agents simply never runs. Kept ON for fidelity;
 * OFF covers every agent with a ceil. R6 removed the shader-side half of the
 * quirk — propagate's idx guard makes any dispatch size safe either way.
 *
 * DIVERGENCE from the fork's exact granularity: it drops up to 99,999 items
 * (its two-level division dispatches (10, 10, floor(N/100000))); this host
 * drops up to 999, per the T9 brief's dispatch contract.
 */
export const QUIRK_DISPATCH_TRUNCATION = true;

const PROPAGATE_INVOCATIONS_PER_GROUP = 1000; // constants.wesl PROPAGATE_WG_* = 10x10x10
const DECAY_WG_EDGE = 8; // constants.wesl DECAY_WG_* — dims are multiples of 8

const UNIFORM_BYTES = 64;
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
};

/**
 * encodeStep — one simulation iteration: propagate over the agents, then decay
 * over the grid, in that order (main.cpp:1105 then 1159). Both dispatches share
 * one compute pass; WebGPU orders dispatches within a pass, so decay cannot
 * observe a half-written deposit field.
 *
 * This is also the Mpc → voxel / degrees → radians boundary: the shaders never
 * see either human unit.
 */
export function encodeStep(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  step: McpmStep,
  params: McpmParams,
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

  const items = step.nDataPoints + step.nAgents;
  const propagateGroups = QUIRK_DISPATCH_TRUNCATION
    ? Math.floor(items / PROPAGATE_INVOCATIONS_PER_GROUP)
    : Math.ceil(items / PROPAGATE_INVOCATIONS_PER_GROUP);

  const pass = encoder.beginComputePass({ label: 'mcpm-step' });
  pass.setBindGroup(0, step.uniformBindGroup);

  pass.setPipeline(step.propagatePipeline);
  pass.setBindGroup(1, step.propagateBindGroups[step.parity]);
  pass.dispatchWorkgroups(propagateGroups);

  pass.setPipeline(step.decayPipeline);
  pass.setBindGroup(1, step.decayBindGroups[step.parity]);
  pass.dispatchWorkgroups(
    box.dims[0] / DECAY_WG_EDGE,
    box.dims[1] / DECAY_WG_EDGE,
    box.dims[2] / DECAY_WG_EDGE,
  );
  pass.end();
}
