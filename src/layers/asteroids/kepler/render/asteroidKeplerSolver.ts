/**
 * asteroidKeplerSolver — uploads the decoded catalog's per-row basis once, then each frame the Layer
 * draws, solves Kepler for every row, culls it, and lists the dots that show into `visible`, counted
 * into the indirect `draws` the dot and pick draws read (spec §4.3). The per-dot photometry runs here
 * once per row, not in each of a dot's vertices. No memo of the last sim time: a cache carried between
 * frames is hidden state. dt is split on the CPU in f64 into whole and fractional days.
 * @module
 */
import type { AsteroidKeplerSolver } from '../@types/AsteroidKeplerSolver';
import type { AsteroidKeplerRows } from '../@types/AsteroidKeplerRows';
import type { AsteroidKeplerFrame } from '../@types/AsteroidKeplerFrame';
import type { AsteroidCatalog } from '../../catalog/@types/AsteroidCatalog';
import type { ClaimTimestampWrites } from '../../../../@types/gpu/timing/ClaimTimestampWrites';
import computeCode from '../../../../services/gpu/shaders/asteroids/kepler/compute.wesl?static';
import { createShaderModuleWithDevLog } from '../../../../services/gpu/shaderCompileLogger';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';

/** Byte offsets inside `KeplerUniforms` (`asteroids/kepler/compute.wesl`). */
export const KEPLER_UNIFORM_OFFSETS = {
  dtWholeDays: 0,
  dtFracDays: 4,
  count: 8,
  selectedRow: 12,
  sunFromCamAu: 16,
  exposure: 28,
  classFade: 32,
  hLimitCenti: 48,
  minFlux: 64,
  maxPhaseDimMag: 68,
} as const;
export const KEPLER_UNIFORM_BYTES = 80;
export const KEPLER_WORKGROUP_SIZE = 64;
/** triCorner: one triangle circumscribing the unit disc, half the vertex work of a quad. */
const VERTICES_PER_DOT = 3;
/** DrawIndirectArgs; the compute adds the instance count (word 1) after a clear. */
const DRAW_ARGS = new Uint32Array([VERTICES_PER_DOT, 0, 0, 0]);
const INSTANCE_COUNT_BYTE = 4;

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
    rows.visible.destroy();
    rows.visibleTags.destroy();
    rows.draws.destroy();
    rows = null;
  }

  function upload(catalog: AsteroidCatalog): void {
    clear();
    const elementsA = storage('asteroid-elements-a', catalog.elementsA);
    const elementsB = storage('asteroid-elements-b', catalog.elementsB);
    const extra = storage('asteroid-extra', catalog.extra);
    const visible = device.createBuffer({
      label: 'asteroid-visible',
      size: catalog.count * 16,
      usage: GPUBufferUsage.STORAGE,
    });
    const visibleTags = device.createBuffer({
      label: 'asteroid-visible-tags',
      size: catalog.count * 4,
      usage: GPUBufferUsage.STORAGE,
    });
    const draws = device.createBuffer({
      label: 'asteroid-draws',
      size: DRAW_ARGS.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(draws, 0, DRAW_ARGS);
    const computeGroup = device.createBindGroup({
      label: 'asteroid-kepler-bg',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: elementsA } },
        { binding: 2, resource: { buffer: elementsB } },
        { binding: 3, resource: { buffer: extra } },
        { binding: 4, resource: { buffer: visible } },
        { binding: 5, resource: { buffer: visibleTags } },
        { binding: 6, resource: { buffer: draws } },
      ],
    });
    rows = {
      count: catalog.count,
      epochJd: catalog.epochJd,
      elementsA,
      elementsB,
      extra,
      visible,
      visibleTags,
      draws,
      computeGroup,
    };
  }

  function encode(
    encoder: GPUCommandEncoder,
    frame: AsteroidKeplerFrame,
    claim: ClaimTimestampWrites,
  ): void {
    if (rows === null) return;
    const o = KEPLER_UNIFORM_OFFSETS;
    const dt = frame.simJd - rows.epochJd;
    const whole = Math.trunc(dt);
    uniformF32[o.dtWholeDays / 4] = whole;
    uniformF32[o.dtFracDays / 4] = dt - whole;
    uniformU32[o.count / 4] = rows.count;
    uniformU32[o.selectedRow / 4] = frame.selectedRow;
    uniformF32.set(frame.sunFromCamAu, o.sunFromCamAu / 4);
    uniformF32[o.exposure / 4] = frame.exposure;
    uniformF32[o.minFlux / 4] = frame.minFlux;
    uniformF32[o.maxPhaseDimMag / 4] = frame.maxPhaseDimMag;
    ASTEROID_CLASSES.forEach((cls, k) => {
      uniformF32[o.classFade / 4 + k] = frame.classFade[cls];
      uniformF32[o.hLimitCenti / 4 + k] = frame.hLimitCenti[cls];
    });
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    // In the encoder, ordered with the passes: a queue write would land before the whole submit.
    encoder.clearBuffer(rows.draws, INSTANCE_COUNT_BYTE, 4);
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
