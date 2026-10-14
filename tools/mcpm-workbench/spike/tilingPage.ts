// Spike-only page: runs the unmodified mcpm propagate/decay kernels for one box, headless.
import propagateSource from '../../../src/services/gpu/shaders/mcpm/propagate.wesl?static';
import decaySource from '../../../src/services/gpu/shaders/mcpm/decay.wesl?static';
import { seedAgents } from '../src/sim/seedAgents';
import type { GridBox } from '../@types/GridBox';
import type { Vec3 } from '../../../src/@types/math/Vec3';

type RunCfg = {
  box: GridBox;
  positions: number[]; // world Mpc xyz, already culled to box
  weights: number[];
  agentCount: number;
  seed: number;
  steps: number;
  pinAgentsM: number | null; // null = shader's own nAgents-derived threshold
  crop: { lo: Vec3; hi: Vec3 }; // voxel range to return
};

const P = { senseSpreadDeg: 20, senseDistanceMpc: 4.6, turnAngleDeg: 10, moveDistanceMpc: 0.1, depositValue: 0, persistence: 0.8, sharpness: 2.5, normalizationFactor: 1 };
const NAGENTS_LINE = 'let nAgentsM = f32(sim.nAgents) / 1.0e6;';

let devicePromise: Promise<GPUDevice> | null = null;
function getDevice(): Promise<GPUDevice> {
  devicePromise ??= (async () => {
    const a = await navigator.gpu.requestAdapter();
    if (!a) throw new Error('no adapter');
    return a.requestDevice({ requiredLimits: {
      maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize,
      maxBufferSize: a.limits.maxBufferSize,
      maxComputeInvocationsPerWorkgroup: 256,
    } });
  })();
  return devicePromise;
}

(window as any).runMcpm = async (cfg: RunCfg): Promise<void> => {
  const device = await getDevice();
  const { box } = cfg;
  const [W, H, D] = box.dims;
  const nData = cfg.weights.length;
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const grid = () => device.createBuffer({ size: W * H * D * 4, usage });
  const [depA, depB, trace] = [grid(), grid(), grid()];

  // seedAgents demands its 100k quantum; seed the rounded-up count and keep the exact prefix.
  const quantum = Math.ceil(cfg.agentCount / 100_000) * 100_000;
  const s = seedAgents({
    points: { positions: new Float32Array(cfg.positions), log10StellarMass: new Float32Array(nData), count: nData, sources: [] },
    weights: { weights: new Float32Array(cfg.weights), nanCount: 0, medianLog10Mass: 0 },
    box, agentCount: quantum, mode: 'aroundData', seed: cfg.seed,
  });
  const total = nData + cfg.agentCount;
  const lanes = [s.x, s.y, s.z, s.phi, s.theta, s.weight].map((arr) => {
    const b = device.createBuffer({ size: total * 4, usage });
    device.queue.writeBuffer(b, 0, arr.subarray(0, total));
    return b;
  });

  const prop = cfg.pinAgentsM === null ? propagateSource : propagateSource.replace(NAGENTS_LINE, `let nAgentsM = ${cfg.pinAgentsM.toFixed(6)};`);
  if (cfg.pinAgentsM !== null && prop === propagateSource) throw new Error('nAgentsM line not found');
  const propagate = device.createComputePipeline({ layout: 'auto', compute: {
    module: device.createShaderModule({ code: prop }), entryPoint: 'cs',
    constants: { PROPAGATE_WG_X: 10, PROPAGATE_WG_Y: 10, PROPAGATE_WG_Z: 2 } } });
  const decay = device.createComputePipeline({ layout: 'auto', compute: {
    module: device.createShaderModule({ code: decaySource }), entryPoint: 'cs',
    constants: { DECAY_WG_X: 8, DECAY_WG_Y: 8, DECAY_WG_Z: 4 } } });

  const uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const u = new ArrayBuffer(64); const f = new Float32Array(u); const i = new Int32Array(u);
  const DEG = Math.PI / 180;
  f[0] = P.senseSpreadDeg * DEG; f[1] = P.senseDistanceMpc / box.voxelSizeMpc; f[2] = P.turnAngleDeg * DEG;
  f[3] = P.moveDistanceMpc / box.voxelSizeMpc; f[4] = P.depositValue; f[5] = P.persistence; f[6] = 0;
  i[7] = W; i[8] = H; i[9] = D; f[10] = P.sharpness; f[11] = P.normalizationFactor; i[12] = nData; i[13] = cfg.agentCount;

  const bg = (pipe: GPUComputePipeline, group: number, entries: [number, GPUBuffer][]) =>
    device.createBindGroup({ layout: pipe.getBindGroupLayout(group), entries: entries.map(([binding, buffer]) => ({ binding, resource: { buffer } })) });
  const agentEntries = lanes.map((b, k) => [3 + k, b] as [number, GPUBuffer]);
  const propU = bg(propagate, 0, [[0, uniform]]);
  const decU = bg(decay, 0, [[0, uniform]]);
  const propG = [depA, depB].map((d) => bg(propagate, 1, [[0, d], [2, trace], ...agentEntries]));
  const decG = [[depA, depB], [depB, depA]].map(([a, b]) => bg(decay, 1, [[0, a!], [1, b!], [2, trace]]));

  const groups = Math.ceil(total / 200);
  const gx = Math.min(groups, 65535), gy = Math.ceil(groups / gx);
  let parity = 0;
  const t0 = performance.now();
  for (let step = 0; step < cfg.steps; step++) {
    parity ^= 1;
    i[14] = step;
    device.queue.writeBuffer(uniform, 0, u);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(propagate); pass.setBindGroup(0, propU); pass.setBindGroup(1, propG[parity]!);
    pass.dispatchWorkgroups(gx, gy, 1);
    pass.setPipeline(decay); pass.setBindGroup(0, decU); pass.setBindGroup(1, decG[parity]!);
    pass.dispatchWorkgroups(W / 8, H / 8, D / 4);
    pass.end();
    device.queue.submit([enc.finish()]);
    if (step % 25 === 24) {
      await device.queue.onSubmittedWorkDone();
      (window as any).progress(step + 1, (performance.now() - t0) / 1000);
    }
  }

  const staging = device.createBuffer({ size: W * H * D * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(trace, 0, staging, 0, W * H * D * 4);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const all = new Float32Array(staging.getMappedRange());
  const { lo, hi } = cfg.crop;
  const cw = hi[0] - lo[0], ch = hi[1] - lo[1], cd = hi[2] - lo[2];
  const out = new Float32Array(cw * ch * cd);
  for (let z = 0; z < cd; z++) for (let y = 0; y < ch; y++) {
    const src = (z + lo[2]) * W * H + (y + lo[1]) * W + lo[0];
    out.set(all.subarray(src, src + cw), (z * ch + y) * cw);
  }
  staging.unmap();
  for (const b of [depA, depB, trace, staging, uniform, ...lanes]) b.destroy();
  const bytes = new Uint8Array(out.buffer);
  const CHUNK = 1 << 22;
  for (let o = 0; o < bytes.length; o += CHUNK) {
    let bin = ''; const sl = bytes.subarray(o, o + CHUNK);
    for (let k = 0; k < sl.length; k += 0x8000) bin += String.fromCharCode(...sl.subarray(k, k + 0x8000));
    await (window as any).sendChunk(btoa(bin));
  }
};
(window as any).ready = true;
