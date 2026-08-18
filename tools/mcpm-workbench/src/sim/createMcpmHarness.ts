/**
 * createMcpmHarness — the host that turns the mcpm WESL kernels into a
 * stepping simulation: device, buffers, explicit layouts, seeding, and the
 * per-step propagate → decay encode.
 *
 * Bind-group layouts are EXPLICIT, never 'auto': 'auto' dedupes entries, and
 * the deposit ping-pong needs two bind groups that differ only in which
 * physical buffer sits at slot 0.
 */
import type { AgentInitMode } from '../../@types/AgentInitMode';
import type { AgentWeights } from '../../@types/AgentWeights';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import type { GridBox } from '../../@types/GridBox';
import type { GridElement } from '../../@types/GridElement';
import type { McpmHarness } from '../../@types/McpmHarness';
import type { McpmParams } from '../../@types/McpmParams';
import { initGpu } from '../../../../src/services/gpu/device';
import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import propagateSource from '../../../../src/services/gpu/shaders/mcpm/propagate.wesl?static';
import decaySource from '../../../../src/services/gpu/shaders/mcpm/decay.wesl?static';
import { createGridBuffers } from './createGridBuffers';
import { encodeStep } from './encodeStep';
import { planGridBudget } from './planGridBudget';
import { readbackTrace } from './readbackTrace';
import { AGENT_COUNT_STEP, seedAgents } from './seedAgents';
import { specializeGridElement } from './specializeGridElement';

// io.wesl's @group(1) slot contract: propagate binds 0 and 2..8, decay 0..2.
const PROPAGATE_SLOTS = [0, 2, 3, 4, 5, 6, 7, 8];
const DECAY_SLOTS = [0, 1, 2];

const storageLayout = (
  device: GPUDevice,
  label: string,
  slots: readonly number[],
): GPUBindGroupLayout =>
  device.createBindGroupLayout({
    label,
    entries: slots.map((binding) => ({
      binding,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'storage' as const },
    })),
  });

export async function createMcpmHarness(opts: {
  readonly canvas: HTMLCanvasElement;
  readonly points: CatalogPoints;
  readonly weights: AgentWeights;
  readonly box: GridBox;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly seed: number;
}): Promise<McpmHarness> {
  // Every input check runs BEFORE any GPU allocation: a bad count or an empty
  // selection must fail without leaking buffers already created downstream.
  //
  // catalogBounds and the seeder both misbehave silently on an empty selection
  // (every tier excluded), so refuse it here rather than fit a grid to nothing.
  if (opts.points.count === 0) {
    throw new Error('createMcpmHarness: no catalog points — every source tier is excluded');
  }
  // Mirrors seedAgents' own check: enforced here too so a bad count is refused
  // before any GPU allocation, not after createGridBuffers has already run.
  if (opts.agentCount < AGENT_COUNT_STEP || opts.agentCount % AGENT_COUNT_STEP !== 0) {
    throw new Error(
      `createMcpmHarness: agentCount must be a positive multiple of ${AGENT_COUNT_STEP}`,
    );
  }

  const gpu = await initGpu(opts.canvas, {
    requiredFeatures: ['shader-f16'],
    requiredLimits: {
      maxComputeInvocationsPerWorkgroup: 1024, // propagate's 10x10x10 = 1000
      maxBufferSize: Number.MAX_SAFE_INTEGER, // clamped to the adapter's max by initGpu
      maxStorageBufferBindingSize: Number.MAX_SAFE_INTEGER,
    },
  });
  const { device } = gpu;

  // The device's own answer picks the element, so the flag and the device can
  // never disagree — there is deliberately no user toggle.
  const element: GridElement = device.features.has('shader-f16') ? 'f16' : 'f32';

  const agentBufferLength = opts.points.count + opts.agentCount;
  const budget = planGridBudget(opts.box, agentBufferLength, element, device.limits);
  if (budget.refusal) {
    const { buffer, requestedBytes, limitBytes, maxLongAxis } = budget.refusal;
    throw new Error(
      `createMcpmHarness: ${buffer} needs ${requestedBytes} bytes, over this device's ` +
        `${limitBytes}-byte limit. Largest long axis that fits: ${maxLongAxis}.`,
    );
  }

  const propagateModule = createShaderModuleWithDevLog(
    device,
    specializeGridElement(propagateSource, element),
    'mcpm-propagate',
  );
  const decayModule = createShaderModuleWithDevLog(
    device,
    specializeGridElement(decaySource, element),
    'mcpm-decay',
  );

  const uniformLayout = device.createBindGroupLayout({
    label: 'mcpm-uniform-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }],
  });
  const propagateLayout = storageLayout(device, 'mcpm-propagate-layout', PROPAGATE_SLOTS);
  const decayLayout = storageLayout(device, 'mcpm-decay-layout', DECAY_SLOTS);

  const propagatePipeline = device.createComputePipeline({
    label: 'mcpm-propagate',
    layout: device.createPipelineLayout({ bindGroupLayouts: [uniformLayout, propagateLayout] }),
    compute: { module: propagateModule, entryPoint: 'cs' },
  });
  const decayPipeline = device.createComputePipeline({
    label: 'mcpm-decay',
    layout: device.createPipelineLayout({ bindGroupLayouts: [uniformLayout, decayLayout] }),
    compute: { module: decayModule, entryPoint: 'cs' },
  });

  const buffers = createGridBuffers(device, opts.box, agentBufferLength, element);

  const uniformBindGroup = device.createBindGroup({
    label: 'mcpm-uniforms',
    layout: uniformLayout,
    entries: [{ binding: 0, resource: { buffer: buffers.uniform } }],
  });

  // The fork's is_a ping-pong: propagate accumulates into the deposit grid that
  // decay reads this step, and decay writes the other one, which the next
  // step's flipped parity hands back to propagate (main.cpp:1107/1162).
  const agentEntries = [
    buffers.agentX,
    buffers.agentY,
    buffers.agentZ,
    buffers.agentPhi,
    buffers.agentTheta,
    buffers.agentWeight,
  ].map((buffer, i) => ({ binding: 3 + i, resource: { buffer } }));

  const propagateBindGroup = (deposit: GPUBuffer, label: string): GPUBindGroup =>
    device.createBindGroup({
      label,
      layout: propagateLayout,
      entries: [
        { binding: 0, resource: { buffer: deposit } },
        { binding: 2, resource: { buffer: buffers.trace } },
        ...agentEntries,
      ],
    });
  const decayBindGroup = (deposit: GPUBuffer, out: GPUBuffer, label: string): GPUBindGroup =>
    device.createBindGroup({
      label,
      layout: decayLayout,
      entries: [
        { binding: 0, resource: { buffer: deposit } },
        { binding: 1, resource: { buffer: out } },
        { binding: 2, resource: { buffer: buffers.trace } },
      ],
    });

  const propagateBindGroups = [
    propagateBindGroup(buffers.depositA, 'mcpm-propagate-a'),
    propagateBindGroup(buffers.depositB, 'mcpm-propagate-b'),
  ] as const;
  const decayBindGroups = [
    decayBindGroup(buffers.depositA, buffers.depositB, 'mcpm-decay-a'),
    decayBindGroup(buffers.depositB, buffers.depositA, 'mcpm-decay-b'),
  ] as const;

  let parity: 0 | 1 = 0;
  let iteration = 0;

  function uploadAgents(mode: AgentInitMode, seed: number): void {
    const seeded = seedAgents({
      points: opts.points,
      weights: opts.weights,
      box: opts.box,
      agentCount: opts.agentCount,
      mode,
      seed,
    });
    device.queue.writeBuffer(buffers.agentX, 0, seeded.x);
    device.queue.writeBuffer(buffers.agentY, 0, seeded.y);
    device.queue.writeBuffer(buffers.agentZ, 0, seeded.z);
    device.queue.writeBuffer(buffers.agentPhi, 0, seeded.phi);
    device.queue.writeBuffer(buffers.agentTheta, 0, seeded.theta);
    device.queue.writeBuffer(buffers.agentWeight, 0, seeded.weight);
  }

  function clearBuffers(targets: readonly GPUBuffer[]): void {
    const encoder = device.createCommandEncoder({ label: 'mcpm-clear' });
    for (const target of targets) encoder.clearBuffer(target);
    device.queue.submit([encoder.finish()]);
  }

  uploadAgents(opts.initMode, opts.seed);

  return {
    element,
    box: opts.box,
    gpu,
    traceBuffer: buffers.trace,
    agents: {
      x: buffers.agentX,
      y: buffers.agentY,
      z: buffers.agentZ,
      theta: buffers.agentTheta,
      weight: buffers.agentWeight,
      nDataPoints: opts.points.count,
      count: agentBufferLength,
    },
    step(params: McpmParams): void {
      // Flip BEFORE encoding, as the fork does at the top of its propagate block.
      parity = parity === 0 ? 1 : 0;
      const encoder = device.createCommandEncoder({ label: 'mcpm-step' });
      encodeStep(
        device,
        encoder,
        {
          propagatePipeline,
          decayPipeline,
          uniformBuffer: buffers.uniform,
          uniformBindGroup,
          propagateBindGroups,
          decayBindGroups,
          box: opts.box,
          nDataPoints: opts.points.count,
          nAgents: opts.agentCount,
          parity,
          iteration,
        },
        params,
      );
      device.queue.submit([encoder.finish()]);
      iteration += 1; // the fork increments at the END of the frame
    },
    clearTrace(): void {
      clearBuffers([buffers.trace]);
    },
    reset(mode: AgentInitMode, seed: number): void {
      uploadAgents(mode, seed);
      clearBuffers([buffers.depositA, buffers.depositB, buffers.trace]);
      iteration = 0;
    },
    dispose(): void {
      // The device stays alive: the harness shares the canvas context with the
      // tool's render graph, which outlives a sim teardown.
      buffers.destroy();
    },
    readbackTrace() {
      return readbackTrace(device, buffers.trace, opts.box, element);
    },
  };
}
