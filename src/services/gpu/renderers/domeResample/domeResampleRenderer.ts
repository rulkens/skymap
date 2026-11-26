/**
 * domeResampleRenderer — a covering triangle that fisheye-resamples the five
 * `dome-cube` faces into `hdr` (`shaders/domeResample`), and a second pipeline
 * that carries their occlusion masks to the same image. One sampled texture,
 * no uniforms: the tilt lives only in the face rotations baked into
 * `dome-cube`'s layers. Bind group rebuilt per draw, same reason as
 * `cubeFaceBlitRenderer`: a cached group could bind a view `reconcile()` replaced.
 */

import type { DomeResampleRenderer } from '../../../../@types/rendering/DomeResampleRenderer';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import vsCode from '../../shaders/domeResample/vertex.wesl?static';
import fsCode from '../../shaders/domeResample/fragment.wesl?static';
import fsOcclusionCode from '../../shaders/domeResample/fragmentOcclusion.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

export function createDomeResampleRenderer(init: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
  readonly occlusionFormat: GPUTextureFormat;
}): DomeResampleRenderer {
  const { device, targetFormat, occlusionFormat } = init;

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

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'domeResample.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'domeResample.fragment');
  const pipeline = device.createRenderPipeline({
    label: 'domeResample-pipeline',
    layout: device.createPipelineLayout({
      label: 'domeResample-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    // No blend and no depth: the resample replaces every hdr pixel outright.
    fragment: { module: fsModule, entryPoint: 'fs', targets: [{ format: targetFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  // The masks are a 32-bit float texture: unfilterable, read by `textureLoad` alone.
  const occlusionLayout = device.createBindGroupLayout({
    label: 'domeResample-occlusion-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'unfilterable-float', viewDimension: '2d-array' },
      },
    ],
  });
  const occlusionPipeline = device.createRenderPipeline({
    label: 'domeResample-occlusion-pipeline',
    layout: device.createPipelineLayout({
      label: 'domeResample-occlusion-pipeline-layout',
      bindGroupLayouts: [occlusionLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: createShaderModuleWithDevLog(
        device,
        fsOcclusionCode,
        'domeResample.fragmentOcclusion',
      ),
      entryPoint: 'fs',
      targets: [{ format: occlusionFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  function drawOcclusion(pass: GPURenderPassEncoder, faceMasks: GPUTextureView): void {
    pass.setPipeline(occlusionPipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({
        label: 'domeResample-occlusion-bg',
        layout: occlusionLayout,
        entries: [{ binding: 0, resource: faceMasks }],
      }),
    );
    pass.draw(3);
  }

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

  const renderer: DomeResampleRenderer = {
    label: 'domeResampleRenderer',
    draw,
    drawOcclusion,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
