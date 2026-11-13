/**
 * galaxyPointPrintRenderer — the galaxy points as points in the antique look's
 * `antique-print-points` row, one per galaxy, so a galaxy field prints as dots
 * the way a star field prints as glyphs. Reads the visual pass's vertex buffers
 * (the shared vertex layout) through its own pipeline and uniform buffer, as the
 * pick renderer does: no buffer is written by two pipelines.
 */

import vsCode from '../../../../services/gpu/shaders/galaxyCatalog/points/vertexPrint.wesl?static';
import fsCode from '../../../../services/gpu/shaders/antiqueLook/passes/printPointFragment.wesl?static';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { PickSourceDraw } from '../@types/PickSourceDraw';
import type { GalaxyPointPrintRenderer } from '../@types/GalaxyPointPrintRenderer';
import type { FadeUniformsBgl } from '../../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../../@types/rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../../../@types/rendering/FocusUniformsBgl';
import { createDummyFadeBindGroup } from '../../../../services/gpu/lib/dummyFade';
import {
  POINT_STRIDE,
  GALAXY_POINT_VERTEX_ATTRIBUTES,
  UNIFORM_BYTES,
} from './galaxyPointVertexLayout';
import { createShaderModuleWithDevLog } from '../../../../services/gpu/shaderCompileLogger';
import {
  ANTIQUE_PRINT_POINTS_DEPTH,
  ANTIQUE_PRINT_POINTS_FORMAT,
} from '../../../../data/rendering/antiqueLook';

export function createGalaxyPointPrintRenderer(
  device: GPUDevice,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
  focusBgl: FocusUniformsBgl,
  focusBindGroup: GPUBindGroup,
): GalaxyPointPrintRenderer {
  const uniformsBgl = device.createBindGroupLayout({
    label: 'galaxy-points-print-bgl-group0',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const pipeline = device.createRenderPipeline({
    label: 'galaxy-points-print-pipeline',
    // The canonical source and focus layouts, so the store's buffers bind as they are;
    // @group(1) holds an inert fade, as the pick pipeline's does.
    layout: device.createPipelineLayout({
      label: 'galaxy-points-print-pipeline-layout',
      bindGroupLayouts: [uniformsBgl, fadeBgl, sourceBgl, focusBgl],
    }),
    vertex: {
      module: createShaderModuleWithDevLog(device, vsCode, 'galaxyPointsPrint.vertex'),
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: POINT_STRIDE,
          stepMode: 'instance',
          attributes: [...GALAXY_POINT_VERTEX_ATTRIBUTES],
        },
      ],
    },
    fragment: {
      module: createShaderModuleWithDevLog(device, fsCode, 'antiqueLook.printPoint'),
      entryPoint: 'fs',
      targets: [{ format: ANTIQUE_PRINT_POINTS_FORMAT }],
    },
    primitive: { topology: 'point-list' },
    // Depth ranks brightness in COSMO's forward Z (printPoint.wesl): the brightest
    // galaxy in a cell wins it; the stars, printed after, overwrite it.
    depthStencil: {
      format: ANTIQUE_PRINT_POINTS_DEPTH,
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  const uniformBuffer = device.createBuffer({
    label: 'galaxy-points-print-uniform',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformBindGroup = device.createBindGroup({
    label: 'galaxy-points-print-uniform-bg',
    layout: uniformsBgl,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const fade = createDummyFadeBindGroup(device, fadeBgl, 'galaxy-points-print');
  // Keyed by buffer identity: a tier swap destroys the old buffer and drops its group with it.
  const sourceBindGroups = new WeakMap<GPUBuffer, GPUBindGroup>();

  function draw(
    pass: GPURenderPassEncoder,
    sources: readonly PickSourceDraw[],
    uniformBytes: ArrayBuffer,
  ): void {
    if (sources.length === 0) return;
    device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformBindGroup);
    pass.setBindGroup(1, fade.bindGroup);
    pass.setBindGroup(3, focusBindGroup);
    for (const src of sources) {
      let group = sourceBindGroups.get(src.sourceBuffer);
      if (group === undefined) {
        group = device.createBindGroup({
          label: `galaxy-points-print-source-${src.source}`,
          layout: sourceBgl,
          entries: [{ binding: 0, resource: { buffer: src.sourceBuffer } }],
        });
        sourceBindGroups.set(src.sourceBuffer, group);
      }
      pass.setBindGroup(2, group);
      pass.setVertexBuffer(0, src.vertexBuffer);
      pass.draw(1, src.count);
    }
  }

  function destroy(): void {
    fade.buffer.destroy();
    uniformBuffer.destroy();
  }

  const renderer: GalaxyPointPrintRenderer = { label: 'galaxyPointPrintRenderer', draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
