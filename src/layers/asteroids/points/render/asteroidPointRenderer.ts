/**
 * asteroidPointRenderer — the asteroids as screen-sized additive dots in the depthless HDR
 * accumulation, under the trails' occlusion (lib/trailOcclusion.wesl owns group 0 bindings 0-1; ours
 * are 2, the uniforms, and 3-4, the solver's helio and extra rows). One instance = one catalog row, so
 * the pick word is the row. `drawPick` stamps the same instances wider into the overlay pick target
 * with its own uniform and bind group, so a pick never rewrites what the frame drew with.
 * @module
 */

import type { AsteroidPointRenderer } from '../@types/AsteroidPointRenderer';
import type { AsteroidPointFrame } from '../@types/AsteroidPointFrame';
import type { AsteroidKeplerSolver } from '../../kepler/@types/AsteroidKeplerSolver';
import type { AsteroidKeplerRows } from '../../kepler/@types/AsteroidKeplerRows';
import vsCode from '../../../../services/gpu/shaders/asteroids/points/vertex.wesl?static';
import fsCode from '../../../../services/gpu/shaders/asteroids/points/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../../services/gpu/shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../../../services/gpu/lib/blendStates';
import { NEAR0, SLAB_REVERSED_Z } from '../../../../services/engine/frame/slabs';
import { pickDepthFormat } from '../../../../services/engine/frame/pickProgram';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import {
  OCCLUDER_UNIFORM_BYTES,
  createTrailOcclusionUniforms,
} from '../../../../services/gpu/renderers/bodies/trailOcclusionUniforms';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_CLASS_COLORS } from '../data/asteroidClassColors';
import { ASTEROID_POINT_STYLE } from '../data/asteroidPointStyle';

/** Byte offsets inside `AsteroidUniforms` (`asteroids/points/io.wesl`). */
export const ASTEROID_UNIFORM_OFFSETS = {
  viewProj: 0,
  viewportPx: 64,
  pxPerRad: 72,
  sunFromCamAu: 80,
  exposure: 92,
  classColor: 96,
  selectedCamRelAu: 176,
  selectedRow: 188,
  windowFade: 192,
  pickBase: 196,
  sizePx: 200,
} as const;
export const ASTEROID_UNIFORM_BYTES = 208;
/** triCorner: one triangle circumscribing the unit disc, half the vertex work of a quad. */
const VERTICES_PER_DOT = 3;

export function createAsteroidPointRenderer({
  device,
  targetFormat,
  pickCode,
  solver,
}: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
  pickCode: number;
  solver: AsteroidKeplerSolver;
}): AsteroidPointRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'asteroidPoints.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'asteroidPoints.fragment');

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'asteroid-points-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });
  const layout = device.createPipelineLayout({
    label: 'asteroid-points-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  });
  const pipeline = device.createRenderPipeline({
    label: 'asteroid-points-pipeline',
    layout,
    vertex: { module: vsModule, entryPoint: 'vs' },
    // No depthStencil: the hdr target has no depth attachment.
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
  });
  const pickPipeline = device.createRenderPipeline({
    label: 'asteroid-points-pick-pipeline',
    layout,
    vertex: { module: vsModule, entryPoint: 'vsPick' },
    fragment: { module: fsModule, entryPoint: 'fsPick', targets: [{ format: 'r32uint' }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: pickDepthFormat(NEAR0),
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', SLAB_REVERSED_Z[NEAR0]!),
    },
  });

  const drawBinding = createBinding('asteroid-points', ASTEROID_POINT_STYLE.dotRadiusPx);
  const pickBinding = createBinding('asteroid-points-pick', ASTEROID_POINT_STYLE.pickRadiusPx);

  const uniformScratch = new Float32Array(ASTEROID_UNIFORM_BYTES / 4);
  const uniformWords = new Uint32Array(uniformScratch.buffer);
  uniformWords[ASTEROID_UNIFORM_OFFSETS.pickBase / 4] = packSelection(
    pickCode,
    PICK_SENTINEL_OFFSET,
  );
  ASTEROID_CLASSES.forEach((cls, k) => {
    uniformScratch.set(ASTEROID_CLASS_COLORS[cls], ASTEROID_UNIFORM_OFFSETS.classColor / 4 + 4 * k);
  });

  /** One uniform + occluder buffer pair and its bind group, rebuilt when the depth view or rows change. */
  function createBinding(label: string, sizePx: number) {
    const occluderBuffer = device.createBuffer({
      label: `${label}-occluder-uniform`,
      size: OCCLUDER_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniformBuffer = device.createBuffer({
      label: `${label}-uniform`,
      size: ASTEROID_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const occluderUniforms = createTrailOcclusionUniforms();
    let cached: {
      readonly depthView: GPUTextureView;
      readonly rows: AsteroidKeplerRows;
      readonly group: GPUBindGroup;
    } | null = null;
    return {
      bind(frame: AsteroidPointFrame, rows: AsteroidKeplerRows): GPUBindGroup {
        occluderUniforms.write(frame.occluders, frame.depth.frame, frame.viewportPx);
        device.queue.writeBuffer(occluderBuffer, 0, occluderUniforms.scratch);
        writeUniforms(uniformBuffer, frame, sizePx);
        if (cached === null || cached.depthView !== frame.depth.view || cached.rows !== rows) {
          cached = {
            depthView: frame.depth.view,
            rows,
            group: device.createBindGroup({
              label: `${label}-bg`,
              layout: bindGroupLayout,
              entries: [
                { binding: 0, resource: { buffer: occluderBuffer } },
                { binding: 1, resource: frame.depth.view },
                { binding: 2, resource: { buffer: uniformBuffer } },
                { binding: 3, resource: { buffer: rows.helio } },
                { binding: 4, resource: { buffer: rows.extra } },
              ],
            }),
          };
        }
        return cached.group;
      },
      destroy(): void {
        occluderBuffer.destroy();
        uniformBuffer.destroy();
      },
    };
  }

  function writeUniforms(buffer: GPUBuffer, frame: AsteroidPointFrame, sizePx: number): void {
    const o = ASTEROID_UNIFORM_OFFSETS;
    const u = uniformScratch;
    u.set(frame.vp, o.viewProj / 4);
    u.set(frame.viewportPx, o.viewportPx / 4);
    u[o.pxPerRad / 4] = frame.pxPerRad;
    u.set(frame.sunFromCamAu, o.sunFromCamAu / 4);
    u[o.exposure / 4] = frame.exposure;
    ASTEROID_CLASSES.forEach((cls, k) => {
      u[o.classColor / 4 + 4 * k + 3] = frame.classFade[cls];
    });
    u.set(frame.selectedCamRelAu, o.selectedCamRelAu / 4);
    uniformWords[o.selectedRow / 4] = frame.selectedRow;
    u[o.windowFade / 4] = frame.windowFade;
    u[o.sizePx / 4] = sizePx;
    device.queue.writeBuffer(buffer, 0, u);
  }

  function record(
    pass: GPURenderPassEncoder,
    frame: AsteroidPointFrame,
    binding: ReturnType<typeof createBinding>,
    target: GPURenderPipeline,
  ): void {
    const rows = solver.rows();
    if (rows === null) return;
    pass.setPipeline(target);
    pass.setBindGroup(0, binding.bind(frame, rows));
    pass.draw(VERTICES_PER_DOT, rows.count);
  }

  return {
    label: 'asteroidPointRenderer',
    draw: (pass, frame) => record(pass, frame, drawBinding, pipeline),
    drawPick: (pass, frame) => record(pass, frame, pickBinding, pickPipeline),
    destroy() {
      drawBinding.destroy();
      pickBinding.destroy();
    },
  };
}
