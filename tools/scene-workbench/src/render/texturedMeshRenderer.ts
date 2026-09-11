/**
 * createTexturedMeshRenderer — the MVS mesh as an indexed, unlit, opaque pass
 * (texturedMesh.wesl) that writes depth for the splats to blend against.
 *
 * 'cullMode: none' is deliberate: MVS triangle winding is not guaranteed
 * consistent, so backface culling drops real surface at random.
 */
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import type { MeshGpuAsset } from './renderResources';
import texturedMeshWgsl from './shaders/texturedMesh.wesl?static';

export type TexturedMeshRenderer = {
  draw(pass: GPURenderPassEncoder, assets: readonly MeshGpuAsset[]): void;
};

export function createTexturedMeshRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): TexturedMeshRenderer {
  const { device } = gpu;
  const module = createShaderModuleWithDevLog(device, texturedMeshWgsl, 'scene-textured-mesh');

  const assetLayout = device.createBindGroupLayout({
    label: 'scene-textured-mesh-asset',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const sampler = device.createSampler({
    label: 'scene-textured-mesh-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const pipeline = device.createRenderPipeline({
    label: 'scene-textured-mesh',
    layout: device.createPipelineLayout({
      label: 'scene-textured-mesh-layout',
      bindGroupLayouts: [cameraLayout, assetLayout],
    }),
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
        },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format: targetFormat }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  // Bind groups only hold references: the asset's dispose() destroys the
  // texture and the entry becomes unreachable with the asset.
  const bindGroups = new WeakMap<MeshGpuAsset, GPUBindGroup>();

  function bindGroupFor(asset: MeshGpuAsset): GPUBindGroup {
    const cached = bindGroups.get(asset);
    if (cached) return cached;
    const bindGroup = device.createBindGroup({
      label: 'scene-textured-mesh-asset',
      layout: assetLayout,
      entries: [
        { binding: 0, resource: asset.texture.createView() },
        { binding: 1, resource: sampler },
      ],
    });
    bindGroups.set(asset, bindGroup);
    return bindGroup;
  }

  return {
    draw(pass, assets): void {
      pass.setPipeline(pipeline);
      for (const asset of assets) {
        pass.setBindGroup(1, bindGroupFor(asset));
        pass.setVertexBuffer(0, asset.positions);
        pass.setVertexBuffer(1, asset.uvs);
        pass.setIndexBuffer(asset.indices, 'uint32');
        pass.drawIndexed(asset.indexCount);
      }
    },
  };
}
