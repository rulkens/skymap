/**
 * letterboxRenderer — the film look's 2.39:1 bars as frame code, so a capture
 * of the swap texture carries them. One covering triangle drawn twice, each
 * time under a scissor rect cut to one bar; no bindings, no blend, opaque black.
 * Bar height is in TARGET pixels, floored so the picture never loses a row to
 * rounding.
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
    const barPx = Math.max(0, Math.floor((height - width / LETTERBOX_ASPECT) / 2));
    if (barPx === 0) return;
    pass.setPipeline(pipeline);
    pass.setScissorRect(0, 0, width, barPx);
    pass.draw(3);
    pass.setScissorRect(0, height - barPx, width, barPx);
    pass.draw(3);
    pass.setScissorRect(0, 0, width, height);
  }

  function destroy(): void {}

  const renderer: LetterboxRenderer = { label: 'letterboxRenderer', draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
