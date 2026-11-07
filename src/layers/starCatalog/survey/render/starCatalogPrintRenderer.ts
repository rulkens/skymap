/**
 * starCatalogPrintRenderer — the print twin of `starCatalogRenderer` for the
 * antique look: the frame cut's LEAF list as points in `antique-print-points`,
 * through the visual renderer's layouts, records and lists (`pickResources`).
 * It owns its camera uniform, since writing the visual one would race at submit.
 */

import type { StarCatalogPrintRenderer } from '../@types/StarCatalogPrintRenderer';
import type { StarCatalogPickResources } from '../@types/StarCatalogPickResources';
import type { StarCatalogSourceType } from '../../@types/StarCatalogSourceType';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import vsCode from '../../../../services/gpu/shaders/starCatalog/printVertex.wesl?static';
import fsCode from '../../../../services/gpu/shaders/antiqueLook/printPoint.wesl?static';
import { createShaderModuleWithDevLog } from '../../../../services/gpu/shaderCompileLogger';
import { writeCameraPrefix } from '../../../../services/gpu/lib/cameraUniforms';
import {
  ANTIQUE_PRINT_POINTS_DEPTH,
  ANTIQUE_PRINT_POINTS_FORMAT,
} from '../../../../data/rendering/antiqueLook';
import { STAR_UNIFORM_BYTES } from './starCatalogLayout';

/** Print points carry no size; the camera prefix is the whole uniform the stage reads. */
const NO_VIEWPORT: readonly [number, number] = [1, 1];

export function createStarCatalogPrintRenderer(
  device: GPUDevice,
  resources: StarCatalogPickResources,
): StarCatalogPrintRenderer {
  const { cameraBgl, drawBgl, recordsBgl } = resources;
  const pipeline = device.createRenderPipeline({
    label: 'star-catalog-print-pipeline',
    layout: device.createPipelineLayout({
      label: 'star-catalog-print-pipeline-layout',
      bindGroupLayouts: [cameraBgl, drawBgl, recordsBgl],
    }),
    vertex: {
      module: createShaderModuleWithDevLog(device, vsCode, 'starCatalogPrint.vertex'),
      entryPoint: 'vs',
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
    label: 'star-catalog-print-uniform',
    size: STAR_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformBindGroup = device.createBindGroup({
    label: 'star-catalog-print-uniform-bg',
    layout: cameraBgl,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const uniformScratch = new Float32Array(STAR_UNIFORM_BYTES / 4);

  function draw(pass: GPURenderPassEncoder, source: StarCatalogSourceType, vp: Float32Array): void {
    const recordsBindGroup = resources.recordsBindGroup(source);
    const leaves = resources.leafDraw(source);
    if (recordsBindGroup === null || leaves === null) return;
    // Identical for every source in a frame, so the repeated write is idempotent.
    writeCameraPrefix(uniformScratch, vp, NO_VIEWPORT, 0);
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformBindGroup);
    pass.setBindGroup(1, leaves.bindGroup);
    pass.setBindGroup(2, recordsBindGroup);
    pass.drawIndirect(leaves.indirect, leaves.indirectOffset);
  }

  function destroy(): void {
    uniformBuffer.destroy();
  }

  const renderer: StarCatalogPrintRenderer = { label: 'starCatalogPrintRenderer', draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
