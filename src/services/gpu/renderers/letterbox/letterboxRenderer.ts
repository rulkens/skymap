/**
 * letterboxRenderer — the film look's 2.39:1 mask as frame code, so a capture
 * of the swap texture carries it. One covering triangle drawn twice, each time
 * under a scissor rect cut to one bar; no bindings, no blend, opaque black.
 * A frame taller than 2.39:1 gets top and bottom bars, a wider one left and
 * right bars, so the picture keeps the ratio either way. Bar size is in TARGET
 * pixels, floored so the picture never loses a row to rounding.
 */

import type { LetterboxRenderer } from '../../../../@types/rendering/LetterboxRenderer';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { Size } from '../../../../@types/rendering/Size';
import { LETTERBOX_ASPECT } from '../../../../data/film/letterboxAspect';
import vsCode from '../../shaders/letterbox/vertex.wesl?static';
import fsCode from '../../shaders/letterbox/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

export function createLetterboxRenderer(init: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
}): LetterboxRenderer {
  const { device, targetFormat } = init;

  const pipeline = device.createRenderPipeline({
    label: 'letterbox-pipeline',
    layout: device.createPipelineLayout({
      label: 'letterbox-pipeline-layout',
      bindGroupLayouts: [],
    }),
    vertex: {
      module: createShaderModuleWithDevLog(device, vsCode, 'letterbox.vertex'),
      entryPoint: 'vs',
    },
    fragment: {
      module: createShaderModuleWithDevLog(device, fsCode, 'letterbox.fragment'),
      entryPoint: 'fs',
      targets: [{ format: targetFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  function draw(pass: GPURenderPassEncoder, { width, height }: Size): void {
    const rowPx = Math.floor((height - width / LETTERBOX_ASPECT) / 2);
    const columnPx = Math.floor((width - height * LETTERBOX_ASPECT) / 2);
    if (rowPx <= 0 && columnPx <= 0) return;
    pass.setPipeline(pipeline);
    if (rowPx > 0) {
      pass.setScissorRect(0, 0, width, rowPx);
      pass.draw(3);
      pass.setScissorRect(0, height - rowPx, width, rowPx);
      pass.draw(3);
    } else {
      pass.setScissorRect(0, 0, columnPx, height);
      pass.draw(3);
      pass.setScissorRect(width - columnPx, 0, columnPx, height);
      pass.draw(3);
    }
    pass.setScissorRect(0, 0, width, height);
  }

  function destroy(): void {}

  const renderer: LetterboxRenderer = { label: 'letterboxRenderer', draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
