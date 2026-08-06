/**
 * ismMapPercolationHarness — measures the SSPSF automaton's percolation
 * threshold by running `ismMapAutomatonStep.wesl` ITSELF, on a real GPU, with no CPU
 * re-implementation of the update rule. A second copy of the automaton would
 * drift within a week (research doc's own standing rule), and a threshold read
 * off the update rule instead of measured is not a measurement at all.
 *
 * Two modes, because the two answer different questions:
 *  - 'seeded'      one ignited cell, `baseIgnition` 0, so activity CAN reach
 *                  exactly zero — the textbook survival probability.
 *  - 'spontaneous' the shipped `baseIgnition`, which never dies; the order
 *                  parameter is steady-state activity against its p=0 floor.
 *
 * The page half of `sweepIsmMapPercolation.ts`; it owns its own GPUDevice and
 * touches no engine state.
 */
import { DEFAULT_GALAXY_ISM_MAP_AUTOMATON_PARAMS } from '../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyIsmMapAutomatonParams';
import {
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
  ISM_MAP_WORKGROUP_SIZE,
} from '../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapAutomatonParams } from '../../../../src/@types/galaxy/GalaxyIsmMapAutomatonParams';
import {
  packIsmMapAutomatonConstants,
  ISM_MAP_AUTOMATON_CONSTANTS_BUFFER_SIZE,
} from '../engine/ismMap/packIsmMapAutomatonConstants';
import { ismMapStepIndexData } from '../engine/ismMap/ismMapStepIndexData';

import ismMapStepWgsl from '../engine/shaders/milkyWay/ismMap/ismMapAutomatonStep.wesl?static';

const CELL_COUNT = ISM_MAP_AZ * ISM_MAP_RINGS;

/**
 * Per-step census of the state texture: how many cells carry age 0, i.e.
 * ignited on that step. Reduced within the workgroup first — 196k atomic adds
 * to one address serialise, 768 do not.
 */
/**
 * `everIgnited` is a per-cell latch (0/1), cleared once per RUN and set the
 * first time a cell ignites during that run — unlike `counts` (a per-step
 * scalar total), this is the spatial record `computeClusters` below needs to
 * tell a single spanning burn from many isolated cavities. Each invocation
 * owns exactly one cell's slot, so the write races with nothing.
 */
const COUNT_ACTIVE_WGSL = /* wgsl */ `
struct CountSlot { index: f32 }

@group(0) @binding(0) var stateTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> counts: array<atomic<u32>>;
@group(0) @binding(2) var<uniform> slot: CountSlot;
@group(0) @binding(3) var<storage, read_write> everIgnited: array<u32>;

var<workgroup> wgActive: atomic<u32>;

@compute @workgroup_size(${ISM_MAP_WORKGROUP_SIZE}, ${ISM_MAP_WORKGROUP_SIZE})
fn cs(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_index) lid: u32,
) {
  if (lid == 0u) {
    atomicStore(&wgActive, 0u);
  }
  workgroupBarrier();
  // No early return: the barriers above and below must be reached uniformly.
  let dims = textureDimensions(stateTex);
  if (all(gid.xy < dims)) {
    let state = textureLoad(stateTex, vec2<i32>(gid.xy), 0);
    if (state.y == 0.0) {
      atomicAdd(&wgActive, 1u);
      everIgnited[gid.y * dims.x + gid.x] = 1u;
    }
  }
  workgroupBarrier();
  if (lid == 0u) {
    atomicAdd(&counts[u32(slot.index)], atomicLoad(&wgActive));
  }
}
`;

/**
 * Overwrite ONE texel with a just-ignited cell, between the automaton's own
 * step-0 seeding pass and step 1. A write-only storage texture leaves every
 * other texel as it stands, which is what makes a single-cell initial
 * condition reachable without forking `ismMapAutomatonStep.wesl`.
 *
 * The state texel used to carry an explicit refractory countdown this pass
 * had to set alongside age; `ismMapAutomatonStep.wesl` now DERIVES refractory
 * from eventAge alone (06-ca-dust-channel-sketch.md), so eventAge=0 here is
 * already sufficient — neither activity nor dust (see GalaxyIsmMap.ts's
 * contract table) feeds ignition probability, so their seed values are inert
 * for this harness's percolation measurement.
 */
const SEED_CELL_WGSL = /* wgsl */ `
struct SeedCell { az: f32, ring: f32, pad0: f32, pad1: f32 }

@group(0) @binding(0) var stateOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var<uniform> seed: SeedCell;

@compute @workgroup_size(1)
fn cs() {
  textureStore(
    stateOut,
    vec2<i32>(i32(seed.az), i32(seed.ring)),
    vec4<f32>(0.0, 0.0, 0.0, 0.0),
  );
}
`;

export type IsmMapPercolationCase = {
  readonly label: string;
  /** Merged over `DEFAULT_GALAXY_ISM_MAP_AUTOMATON_PARAMS`; `steps` is taken from the request instead. */
  readonly params: Partial<GalaxyIsmMapAutomatonParams>;
};

export type IsmMapPercolationRequest = {
  readonly mode: 'seeded' | 'spontaneous';
  readonly steps: number;
  /** Independent hash seeds per case. Survival probability's whole precision comes from this. */
  readonly runs: number;
  /**
   * The radial span the log-polar grid covers. It reaches the automaton only
   * through `ismMapShear.wesl`'s per-ring radius, so it matters exactly as much
   * as `shearRate` does and not at all when that is zero.
   */
  readonly rMin: number;
  readonly rMax: number;
  /** Ring index the single ignition is planted on ('seeded' mode). */
  readonly seedRing: number;
  /**
   * Value the whole arm-forcing texture is filled with. 0 isolates pure
   * percolation; 1 is the ridge crest, which bounds what the arm term can
   * contribute without standing up a real GalaxyDescription.
   */
  readonly armForcingLevel: number;
  readonly cases: readonly IsmMapPercolationCase[];
};

export type IsmMapPercolationResult = {
  readonly label: string;
  readonly params: GalaxyIsmMapAutomatonParams;
  readonly runs: number;
  /** Runs whose active-cell count is still non-zero on the final step. */
  readonly survived: number;
  /** Mean active-cell COUNT per step across runs, index = step. */
  readonly activePerStep: readonly number[];
  /** Mean active fraction over the last fifth of the run — the steady-state order parameter. */
  readonly tailActiveFraction: number;
  readonly peakActiveFraction: number;
  /**
   * Connected components (Moore-8, azimuth wraps) of the "ever ignited this
   * run" mask, measured on the LAST of `runs` only — one extra buffer
   * readback per CASE, not per run, since this is a regime snapshot, not
   * something worth averaging. `largestClusterShare` near 1 is a single
   * spanning burn (supercritical); many small clusters is isolated cavities
   * (subcritical) — the two numbers `spread`'s p_c docstring predicts but
   * never actually measures.
   */
  readonly clusterCount: number;
  readonly largestClusterShare: number;
};

export type IsmMapPercolationReport = {
  readonly adapter: string;
  readonly cellCount: number;
  readonly results: readonly IsmMapPercolationResult[];
  /**
   * Anything the device complained about. A rejected encoder makes every
   * census read zero, which is indistinguishable from a subcritical
   * automaton — so this is the difference between a measurement and a lie.
   */
  readonly gpuErrors: readonly string[];
};

/**
 * Flood fill over the "ever ignited" mask, Moore-8 adjacency with azimuth
 * wraparound (radius does not wrap) — the same neighbourhood `ismMapAutomatonStep.wesl`
 * itself uses. Runs on the MATERIAL-frame grid with no shear un-rotation:
 * shear only rotates which world azimuth a material cell corresponds to, it
 * never changes which cells are lit, so material-frame adjacency answers the
 * same connectivity question un-shearing would, for a fraction of the cost.
 */
function computeClusters(
  everIgnited: Uint32Array,
  azCount: number,
  ringCount: number,
): { readonly clusterCount: number; readonly largestClusterSize: number; readonly totalMarked: number } {
  const cellCount = azCount * ringCount;
  const visited = new Uint8Array(cellCount);
  let clusterCount = 0;
  let largestClusterSize = 0;
  let totalMarked = 0;
  const stack: number[] = [];

  for (let start = 0; start < cellCount; start++) {
    if (everIgnited[start] === 0 || visited[start] === 1) continue;
    clusterCount++;
    let size = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      size++;
      totalMarked++;
      const ring = (idx / azCount) | 0;
      const az = idx % azCount;
      for (let dr = -1; dr <= 1; dr++) {
        const nRing = ring + dr;
        if (nRing < 0 || nRing >= ringCount) continue;
        for (let da = -1; da <= 1; da++) {
          if (dr === 0 && da === 0) continue;
          const nAz = (az + da + azCount) % azCount;
          const nIdx = nRing * azCount + nAz;
          if (everIgnited[nIdx] !== 0 && visited[nIdx] === 0) {
            visited[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }
    }
    if (size > largestClusterSize) largestClusterSize = size;
  }

  return { clusterCount, largestClusterSize, totalMarked };
}

function assertNoDeviceError(device: GPUDevice, what: string): Promise<void> {
  return device.popErrorScope().then((error) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  });
}

export async function runIsmMapPercolation(
  request: IsmMapPercolationRequest,
): Promise<IsmMapPercolationReport> {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('no WebGPU adapter');
  const device = await adapter.requestDevice();
  const info = adapter.info ?? ({} as GPUAdapterInfo);
  const gpuErrors: string[] = [];
  device.addEventListener('uncapturederror', (event) => {
    gpuErrors.push((event as GPUUncapturedErrorEvent).error.message);
  });

  device.pushErrorScope('validation');
  const stepPipe = device.createComputePipeline({
    label: 'ismMapPercolation:stepPipe',
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ label: 'ismMapPercolation:step', code: ismMapStepWgsl }),
      entryPoint: 'cs',
    },
  });
  const countPipe = device.createComputePipeline({
    label: 'ismMapPercolation:countPipe',
    layout: 'auto',
    compute: {
      module: device.createShaderModule({
        label: 'ismMapPercolation:countActive',
        code: COUNT_ACTIVE_WGSL,
      }),
      entryPoint: 'cs',
    },
  });
  const seedPipe = device.createComputePipeline({
    label: 'ismMapPercolation:seedPipe',
    layout: 'auto',
    compute: {
      module: device.createShaderModule({
        label: 'ismMapPercolation:seedCell',
        code: SEED_CELL_WGSL,
      }),
      entryPoint: 'cs',
    },
  });
  await assertNoDeviceError(device, 'pipeline creation');

  const makeStateTex = (label: string): GPUTexture =>
    device.createTexture({
      label,
      size: [ISM_MAP_AZ, ISM_MAP_RINGS],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  const stateA = makeStateTex('ismMapPercolation:stateA');
  const stateB = makeStateTex('ismMapPercolation:stateB');

  const armForcingTex = device.createTexture({
    label: 'ismMapPercolation:armForcingTex',
    size: [ISM_MAP_AZ, ISM_MAP_RINGS],
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: armForcingTex },
    new Float32Array(CELL_COUNT).fill(request.armForcingLevel),
    { bytesPerRow: ISM_MAP_AZ * 4 },
    [ISM_MAP_AZ, ISM_MAP_RINGS],
  );

  const constUbo = device.createBuffer({
    label: 'ismMapPercolation:constUbo',
    size: ISM_MAP_AUTOMATON_CONSTANTS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const stride = device.limits.minUniformBufferOffsetAlignment;
  const stepIndexBuf = device.createBuffer({
    label: 'ismMapPercolation:stepIndexBuf',
    size: request.steps * stride,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(stepIndexBuf, 0, ismMapStepIndexData(request.steps, stride));

  const seedUbo = device.createBuffer({
    label: 'ismMapPercolation:seedUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const countsBuf = device.createBuffer({
    label: 'ismMapPercolation:countsBuf',
    size: request.steps * 4,
    // COPY_DST is for `clearBuffer`, not for any copy: without it every
    // encoder is rejected at finish() and the whole sweep reads zero — which
    // looks exactly like a subcritical automaton.
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const countsStaging = device.createBuffer({
    label: 'ismMapPercolation:countsStaging',
    size: request.steps * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // Per-cell "ignited at some point THIS run" latch — see COUNT_ACTIVE_WGSL's
  // own comment. Cleared every run; only copied to staging on the last run of
  // each case (computeClusters's cost is one readback per case, not per run).
  const everIgnitedBuf = device.createBuffer({
    label: 'ismMapPercolation:everIgnitedBuf',
    size: CELL_COUNT * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const everIgnitedStaging = device.createBuffer({
    label: 'ismMapPercolation:everIgnitedStaging',
    size: CELL_COUNT * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // Even step index writes stateB, odd writes stateA — the same parity
  // createIsmMapAutomatonRunner's dispatch loop runs, and what the census pass
  // has to agree with to read the state a step just wrote.
  const nextTexAt = (step: number): GPUTexture => (step % 2 === 0 ? stateB : stateA);
  const prevTexAt = (step: number): GPUTexture => (step % 2 === 0 ? stateA : stateB);

  // Built once for the whole sweep: every resource they name is stable across
  // cases and runs, only buffer CONTENT changes.
  const stepBindGroups: GPUBindGroup[] = [];
  const countBindGroups: GPUBindGroup[] = [];
  for (let step = 0; step < request.steps; step++) {
    stepBindGroups.push(
      device.createBindGroup({
        label: `ismMapPercolation:stepBG${step}`,
        layout: stepPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: constUbo } },
          { binding: 1, resource: armForcingTex.createView() },
          { binding: 2, resource: prevTexAt(step).createView() },
          { binding: 3, resource: nextTexAt(step).createView() },
          { binding: 4, resource: { buffer: stepIndexBuf, offset: step * stride, size: 4 } },
        ],
      }),
    );
    countBindGroups.push(
      device.createBindGroup({
        label: `ismMapPercolation:countBG${step}`,
        layout: countPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: nextTexAt(step).createView() },
          { binding: 1, resource: { buffer: countsBuf } },
          { binding: 2, resource: { buffer: stepIndexBuf, offset: step * stride, size: 4 } },
          { binding: 3, resource: { buffer: everIgnitedBuf } },
        ],
      }),
    );
  }
  // Step 0 writes stateB, so that is the texture the single ignition lands in.
  const seedBindGroup = device.createBindGroup({
    label: 'ismMapPercolation:seedBG',
    layout: seedPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: nextTexAt(0).createView() },
      { binding: 1, resource: { buffer: seedUbo } },
    ],
  });

  const dispatchX = ISM_MAP_AZ / ISM_MAP_WORKGROUP_SIZE;
  const dispatchY = ISM_MAP_RINGS / ISM_MAP_WORKGROUP_SIZE;
  const grid = { rMin: request.rMin, rMax: request.rMax };

  const results: IsmMapPercolationResult[] = [];
  for (const testCase of request.cases) {
    const params: GalaxyIsmMapAutomatonParams = {
      ...DEFAULT_GALAXY_ISM_MAP_AUTOMATON_PARAMS,
      ...testCase.params,
      steps: request.steps,
    };
    device.queue.writeBuffer(
      seedUbo,
      0,
      new Float32Array([Math.floor(ISM_MAP_AZ / 2), request.seedRing, 0, 0]),
    );

    const activeSum = new Float64Array(request.steps);
    let survived = 0;
    let clusterCount = 0;
    let largestClusterShare = 0;
    for (let run = 0; run < request.runs; run++) {
      // Seeds start at 1: 0 is a legitimate hash input but makes the first run
      // look special in a log, and nothing here needs it.
      device.queue.writeBuffer(
        constUbo,
        0,
        packIsmMapAutomatonConstants({ grid, ismMap: params, seed: run + 1 }),
      );

      const isLastRun = run === request.runs - 1;
      const enc = device.createCommandEncoder({
        label: `ismMapPercolation:${testCase.label}:${run}`,
      });
      enc.clearBuffer(countsBuf);
      enc.clearBuffer(everIgnitedBuf);
      const seedPass = enc.beginComputePass({ label: 'ismMapPercolation:step0' });
      seedPass.setPipeline(stepPipe);
      seedPass.setBindGroup(0, stepBindGroups[0]!);
      seedPass.dispatchWorkgroups(dispatchX, dispatchY);
      seedPass.end();
      if (request.mode === 'seeded') {
        const injectPass = enc.beginComputePass({ label: 'ismMapPercolation:injectSeed' });
        injectPass.setPipeline(seedPipe);
        injectPass.setBindGroup(0, seedBindGroup);
        injectPass.dispatchWorkgroups(1);
        injectPass.end();
      }
      const runPass = enc.beginComputePass({ label: 'ismMapPercolation:steps' });
      for (let step = 1; step < request.steps; step++) {
        runPass.setPipeline(stepPipe);
        runPass.setBindGroup(0, stepBindGroups[step]!);
        runPass.dispatchWorkgroups(dispatchX, dispatchY);
        runPass.setPipeline(countPipe);
        runPass.setBindGroup(0, countBindGroups[step]!);
        runPass.dispatchWorkgroups(dispatchX, dispatchY);
      }
      runPass.end();
      enc.copyBufferToBuffer(countsBuf, 0, countsStaging, 0, request.steps * 4);
      if (isLastRun) {
        enc.copyBufferToBuffer(everIgnitedBuf, 0, everIgnitedStaging, 0, CELL_COUNT * 4);
      }
      device.queue.submit([enc.finish()]);

      await countsStaging.mapAsync(GPUMapMode.READ);
      const counts = new Uint32Array(countsStaging.getMappedRange()).slice();
      countsStaging.unmap();
      for (let step = 0; step < request.steps; step++) activeSum[step]! += counts[step]!;
      if (counts[request.steps - 1]! > 0) survived++;

      if (isLastRun) {
        await everIgnitedStaging.mapAsync(GPUMapMode.READ);
        const everIgnited = new Uint32Array(everIgnitedStaging.getMappedRange()).slice();
        everIgnitedStaging.unmap();
        const clusters = computeClusters(everIgnited, ISM_MAP_AZ, ISM_MAP_RINGS);
        clusterCount = clusters.clusterCount;
        largestClusterShare =
          clusters.totalMarked > 0 ? clusters.largestClusterSize / clusters.totalMarked : 0;
      }
    }

    const activePerStep = [...activeSum].map((sum) => sum / request.runs);
    const tailFrom = Math.floor(request.steps * 0.8);
    const tail = activePerStep.slice(tailFrom);
    results.push({
      label: testCase.label,
      params,
      runs: request.runs,
      survived,
      activePerStep,
      clusterCount,
      largestClusterShare,
      tailActiveFraction: tail.reduce((a, b) => a + b, 0) / tail.length / CELL_COUNT,
      peakActiveFraction: Math.max(...activePerStep) / CELL_COUNT,
    });
  }

  device.destroy();
  return {
    adapter:
      `${info.vendor ?? '?'}/${info.architecture ?? '?'} ${info.device ?? ''} ${info.description ?? ''}`.trim(),
    cellCount: CELL_COUNT,
    results,
    gpuErrors: [...new Set(gpuErrors)],
  };
}
