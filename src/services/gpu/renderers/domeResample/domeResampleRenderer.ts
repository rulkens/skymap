/**
 * domeResampleRenderer — a covering triangle that fisheye-resamples the five
 * `dome-cube` faces into `hdr` (`shaders/domeResample`). One sampled texture,
 * no uniforms: the tilt lives only in the face rotations Task 4 bakes into
 * `dome-cube`'s layers. Bind group rebuilt per draw, same reason as
 * `cubeFaceBlitRenderer`: a cached group could bind a view `reconcile()` replaced.
 */

import type { DomeResampleRenderer } from '../../../../@types/rendering/DomeResampleRenderer';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import resampleCode from '../../shaders/domeResample/domeResample.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

export function createDomeResampleRenderer(init: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
}): DomeResampleRenderer {
  const { device, targetFormat } = init;

  const sampler = device.createSampler({
    label: 'domeResample-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'domeResample-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d-array' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const module = createShaderModuleWithDevLog(device, resampleCode, 'domeResample');
  const pipeline = device.createRenderPipeline({
    label: 'domeResample-pipeline',
    layout: device.createPipelineLayout({
      label: 'domeResample-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module, entryPoint: 'vs' },
    // No blend and no depth: the resample replaces every hdr pixel outright.
    fragment: { module, entryPoint: 'fs', targets: [{ format: targetFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  function draw(pass: GPURenderPassEncoder, faces: GPUTextureView): void {
    const bindGroup = device.createBindGroup({
      label: 'domeResample-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: faces },
        { binding: 1, resource: sampler },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
  }

  function destroy(): void {}

  const renderer: DomeResampleRenderer = { label: 'domeResampleRenderer', draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
