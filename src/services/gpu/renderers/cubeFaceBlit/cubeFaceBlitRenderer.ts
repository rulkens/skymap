/**
 * cubeFaceBlitRenderer — a covering triangle that paints the current colour
 * attachment with a cube sampled through a basis (`shaders/cubeFaceBlit`). One
 * uniform buffer, rewritten per draw: a capture face is its own command buffer
 * (`renderFrame`), so no second write lands before this one's submit.
 */

import type { CubeFaceBlitRenderer } from '../../../../@types/rendering/CubeFaceBlitRenderer';
import type { Mat3 } from '../../../../@types/math/Mat3';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import blitCode from '../../shaders/cubeFaceBlit/cubeFaceBlit.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

// A WGSL `mat3x3<f32>` is three 16-byte columns: 12 floats, not 9.
const BASIS_UNIFORM_FLOATS = 12;

export function createCubeFaceBlitRenderer(init: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
}): CubeFaceBlitRenderer {
  const { device, targetFormat } = init;

  const uniformBuffer = device.createBuffer({
    label: 'cubeFaceBlit-uniform',
    size: BASIS_UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new Float32Array(BASIS_UNIFORM_FLOATS);

  const sampler = device.createSampler({
    label: 'cubeFaceBlit-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'cubeFaceBlit-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: 'cube' },
      },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const module = createShaderModuleWithDevLog(device, blitCode, 'cubeFaceBlit');
  const pipeline = device.createRenderPipeline({
    label: 'cubeFaceBlit-pipeline',
    layout: device.createPipelineLayout({
      label: 'cubeFaceBlit-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module, entryPoint: 'vs' },
    // No blend and no depthStencil: the blit is the face's first, opaque draw
    // into a depthless COSMO capture step.
    fragment: { module, entryPoint: 'fs', targets: [{ format: targetFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  function draw(pass: GPURenderPassEncoder, basis: Readonly<Mat3>, cube: GPUTextureView): void {
    for (let column = 0; column < 3; column++) {
      uniformScratch[column * 4] = basis[column * 3]!;
      uniformScratch[column * 4 + 1] = basis[column * 3 + 1]!;
      uniformScratch[column * 4 + 2] = basis[column * 3 + 2]!;
    }
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);
    // Rebuilt per draw around the caller's cube view, for the lens renderer's
    // reason: a cached group could bind a view a `reconcile()` has replaced.
    const bindGroup = device.createBindGroup({
      label: 'cubeFaceBlit-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: cube },
        { binding: 2, resource: sampler },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
  }

  function destroy(): void {
    uniformBuffer.destroy();
  }

  const renderer: CubeFaceBlitRenderer = { label: 'cubeFaceBlitRenderer', draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
