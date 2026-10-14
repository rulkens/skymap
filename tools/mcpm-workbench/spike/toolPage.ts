// Spike-only page: drives the workbench's own createMcpmHarness unchanged. The only shim reshapes
// workgroups to SwiftShader's 256-invocation cap; idx/gid are bijections, so coverage is identical.
import { createMcpmHarness } from '../src/sim/createMcpmHarness';
import { deriveAgentWeights } from '../src/field/deriveAgentWeights';
import type { GridBox } from '../@types/GridBox';
import type { CatalogPoints } from '../@types/CatalogPoints';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { GpuContext } from '../../../src/@types/rendering/GpuContext';

const RESHAPE: Record<string, { constants: Record<string, number>; zScale: number }> = {
  'mcpm-propagate': { constants: { PROPAGATE_WG_Z: 2 }, zScale: 5 },
  'mcpm-histogram': { constants: { HISTOGRAM_WG_Z: 2 }, zScale: 5 },
  'mcpm-decay': { constants: { DECAY_WG_Z: 4 }, zScale: 2 },
};
const createPipeline = GPUDevice.prototype.createComputePipeline;
GPUDevice.prototype.createComputePipeline = function (desc) {
  const r = RESHAPE[desc.label ?? ''];
  return createPipeline.call(this, r ? { ...desc, compute: { ...desc.compute, constants: r.constants } } : desc);
};
const current = new WeakMap<GPUComputePassEncoder, string>();
const setPipeline = GPUComputePassEncoder.prototype.setPipeline;
GPUComputePassEncoder.prototype.setPipeline = function (p) { current.set(this, p.label); return setPipeline.call(this, p); };
const dispatch = GPUComputePassEncoder.prototype.dispatchWorkgroups;
GPUComputePassEncoder.prototype.dispatchWorkgroups = function (x, y = 1, z = 1) {
  return dispatch.call(this, x, y, z * (RESHAPE[current.get(this) ?? '']?.zScale ?? 1));
};

const PARAMS = { senseSpreadDeg: 20, senseDistanceMpc: 4.6, turnAngleDeg: 10, moveDistanceMpc: 0.1, depositValue: 0, persistence: 0.8, sharpness: 2.5, normalizationFactor: 1 };
let catalog: CatalogPoints;
let device: GPUDevice;

(window as any).setCatalog = async (positions: number[], log10StellarMass: number[]) => {
  catalog = { positions: new Float32Array(positions), log10StellarMass: new Float32Array(log10StellarMass), count: log10StellarMass.length, sources: [] };
  const a = (await navigator.gpu.requestAdapter())!;
  device = await a.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxBufferSize: a.limits.maxBufferSize, maxComputeInvocationsPerWorkgroup: 256 } });
  device.addEventListener('uncapturederror', (e) => console.log('GPU ERROR', (e as GPUUncapturedErrorEvent).error.message));
};

(window as any).runTool = async (cfg: { box: GridBox; agentCount: number; seed: number; steps: number; crop: { lo: Vec3; hi: Vec3 } }) => {
  const harness = await createMcpmHarness({
    gpu: { device } as unknown as GpuContext, points: catalog, weights: deriveAgentWeights(catalog.log10StellarMass, 'stellarMass'),
    box: cfg.box, agentCount: cfg.agentCount, initMode: 'aroundData', seed: cfg.seed,
  });
  const t0 = performance.now();
  for (let s = 0; s < cfg.steps; s++) {
    harness.step(PARAMS, false);
    if (s % 25 === 24) { await device.queue.onSubmittedWorkDone(); (window as any).progress(s + 1, (performance.now() - t0) / 1000); }
  }
  const { data, dims } = await harness.readbackTrace();
  harness.dispose();
  const [W, H] = dims; const { lo, hi } = cfg.crop;
  const cw = hi[0] - lo[0], ch = hi[1] - lo[1], cd = hi[2] - lo[2];
  const out = new Float32Array(cw * ch * cd);
  for (let z = 0; z < cd; z++) for (let y = 0; y < ch; y++) {
    const src = (z + lo[2]) * W * H + (y + lo[1]) * W + lo[0];
    out.set((data as Float32Array).subarray(src, src + cw), (z * ch + y) * cw);
  }
  const bytes = new Uint8Array(out.buffer);
  for (let o = 0; o < bytes.length; o += 1 << 22) {
    let bin = ''; const sl = bytes.subarray(o, o + (1 << 22));
    for (let k = 0; k < sl.length; k += 0x8000) bin += String.fromCharCode(...sl.subarray(k, k + 0x8000));
    await (window as any).sendChunk(btoa(bin));
  }
};
(window as any).ready = true;
