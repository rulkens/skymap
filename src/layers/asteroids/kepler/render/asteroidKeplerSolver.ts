/**
 * asteroidKeplerSolver — uploads the decoded catalog's per-row basis once, then each frame the Layer
 * draws, solves Kepler for every row into the `helio` buffer the dots read (spec §4.3). No memo of the
 * last sim time: the dispatch is cheap enough to run every drawn frame, and a cache carried between
 * frames is hidden state. dt is split on the CPU in f64 into whole and fractional days.
 * @module
 */
import type { AsteroidKeplerSolver } from '../@types/AsteroidKeplerSolver';
import type { AsteroidKeplerRows } from '../@types/AsteroidKeplerRows';
import type { AsteroidCatalog } from '../../catalog/@types/AsteroidCatalog';
import type { ClaimTimestampWrites } from '../../../../@types/gpu/timing/ClaimTimestampWrites';
import computeCode from '../../../../services/gpu/shaders/asteroids/kepler/compute.wesl?static';
import { createShaderModuleWithDevLog } from '../../../../services/gpu/shaderCompileLogger';

/** `KeplerUniforms` (`asteroids/kepler/compute.wesl`): dtWholeDays, dtFracDays, count, pad. */
export const KEPLER_UNIFORM_BYTES = 16;
export const KEPLER_WORKGROUP_SIZE = 64;

export function createAsteroidKeplerSolver(device: GPUDevice): AsteroidKeplerSolver {
  const pipeline = device.createComputePipeline({
    label: 'asteroid-kepler-pipeline',
    layout: 'auto',
    compute: {
      module: createShaderModuleWithDevLog(device, computeCode, 'asteroidKepler.compute'),
      entryPoint: 'main',
    },
  });
  const uniformBuffer = device.createBuffer({
    label: 'asteroid-kepler-uniform',
    size: KEPLER_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniforms = new ArrayBuffer(KEPLER_UNIFORM_BYTES);
  const uniformF32 = new Float32Array(uniforms);
  const uniformU32 = new Uint32Array(uniforms);
  let rows: AsteroidKeplerRows | null = null;

  function storage(label: string, data: Float32Array | Uint32Array): GPUBuffer {
    const buffer = device.createBuffer({
      label,
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  function clear(): void {
    if (rows === null) return;
    rows.elementsA.destroy();
    rows.elementsB.destroy();
    rows.extra.destroy();
    rows.helio.destroy();
    rows = null;
  }

  function upload(catalog: AsteroidCatalog): void {
    clear();
    const elementsA = storage('asteroid-elements-a', catalog.elementsA);
    const elementsB = storage('asteroid-elements-b', catalog.elementsB);
    const extra = storage('asteroid-extra', catalog.extra);
    const helio = device.createBuffer({
      label: 'asteroid-helio',
      size: catalog.count * 16,
      usage: GPUBufferUsage.STORAGE,
    });
    const computeGroup = device.createBindGroup({
      label: 'asteroid-kepler-bg',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: elementsA } },
        { binding: 2, resource: { buffer: elementsB } },
        { binding: 3, resource: { buffer: extra } },
        { binding: 4, resource: { buffer: helio } },
      ],
    });
    rows = {
      count: catalog.count,
      epochJd: catalog.epochJd,
      elementsA,
      elementsB,
      extra,
      helio,
      computeGroup,
    };
  }

  function encode(encoder: GPUCommandEncoder, simJd: number, claim: ClaimTimestampWrites): void {
    if (rows === null) return;
    const dt = simJd - rows.epochJd;
    const whole = Math.trunc(dt);
    uniformF32[0] = whole;
    uniformF32[1] = dt - whole;
    uniformU32[2] = rows.count;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    const pass = encoder.beginComputePass({ label: 'asteroid-kepler', ...claim() });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, rows.computeGroup);
    pass.dispatchWorkgroups(Math.ceil(rows.count / KEPLER_WORKGROUP_SIZE));
    pass.end();
  }

  return {
    label: 'asteroidKeplerSolver',
    upload,
    clear,
    rows: () => rows,
    encode,
    destroy() {
      clear();
      uniformBuffer.destroy();
    },
  };
}
