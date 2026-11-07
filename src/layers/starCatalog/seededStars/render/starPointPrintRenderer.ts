/**
 * starPointPrintRenderer — the seeded stars as points in `antique-print-points`.
 * Its instance buffer grows only (the roster is fixed at ~160 stars) and is
 * written once per frame: the print line runs in the canvas view alone, since
 * the look is canvas-only (`antiqueLookOn`).
 */

import type { StarPointPrintRenderer } from '../@types/StarPointPrintRenderer';
import type { PrintStar } from '../@types/PrintStar';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import vsCode from '../../../../services/gpu/shaders/bodies/starPoints/printVertex.wesl?static';
import fsCode from '../../../../services/gpu/shaders/antiqueLook/printPoint.wesl?static';
import { createShaderModuleWithDevLog } from '../../../../services/gpu/shaderCompileLogger';
import { writeCameraPrefix } from '../../../../services/gpu/lib/cameraUniforms';
import {
  ANTIQUE_PRINT_POINTS_DEPTH,
  ANTIQUE_PRINT_POINTS_FORMAT,
} from '../../../../data/rendering/antiqueLook';

/** position xyz, then absMag and fade: `printVertex.wesl`'s locations 0 and 1. */
const FLOATS_PER_STAR = 5;
const CAMERA_UNIFORM_BYTES = 80;
const NO_VIEWPORT: readonly [number, number] = [1, 1];

export function createStarPointPrintRenderer(device: GPUDevice): StarPointPrintRenderer {
  const bgl = device.createBindGroupLayout({
    label: 'star-points-print-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const pipeline = device.createRenderPipeline({
    label: 'star-points-print-pipeline',
    layout: device.createPipelineLayout({
      label: 'star-points-print-pipeline-layout',
      bindGroupLayouts: [bgl],
    }),
    vertex: {
      module: createShaderModuleWithDevLog(device, vsCode, 'starPointsPrint.vertex'),
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: FLOATS_PER_STAR * 4,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x2' },
          ],
        },
      ],
    },
    fragment: {
      module: createShaderModuleWithDevLog(device, fsCode, 'antiqueLook.printPoint'),
      entryPoint: 'fs',
      targets: [{ format: ANTIQUE_PRINT_POINTS_FORMAT }],
    },
    primitive: { topology: 'point-list' },
    // Depth is magnitude (printPoint.wesl): the brightest point in a texel wins.
    depthStencil: {
      format: ANTIQUE_PRINT_POINTS_DEPTH,
      depthWriteEnabled: true,
      depthCompare: 'greater',
    },
  });

  const uniformBuffer = device.createBuffer({
    label: 'star-points-print-uniform',
    size: CAMERA_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    label: 'star-points-print-bg',
    layout: bgl,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const uniformScratch = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
  let instances: GPUBuffer | null = null;
  let capacity = 0;

  function draw(pass: GPURenderPassEncoder, vp: Float32Array, stars: readonly PrintStar[]): void {
    if (stars.length === 0) return;
    const packed = new Float32Array(stars.length * FLOATS_PER_STAR);
    stars.forEach(({ posRelCamMpc, absMag, fade }, i) => {
      packed.set([...posRelCamMpc, absMag, fade], i * FLOATS_PER_STAR);
    });
    if (instances === null || stars.length > capacity) {
      instances?.destroy();
      capacity = stars.length;
      instances = device.createBuffer({
        label: 'star-points-print-instances',
        size: packed.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(instances, 0, packed);
    writeCameraPrefix(uniformScratch, vp, NO_VIEWPORT, 0);
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, instances);
    pass.draw(1, stars.length);
  }

  function destroy(): void {
    instances?.destroy();
    uniformBuffer.destroy();
  }

  const renderer: StarPointPrintRenderer = { label: 'starPointPrintRenderer', draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
