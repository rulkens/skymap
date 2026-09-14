/**
 * createTexturedMeshRenderer — the MVS mesh as an indexed, unlit, opaque pass
 * (texturedMesh.wesl) that writes depth for the splats to blend against, plus
 * the optional wireframe overlay (meshWireframe.wesl) — WebGPU has no wireframe
 * fill mode, so the edges are line-list draws over the same positions, one per
 * edge class (manifold, then open) off one shader with an override constant.
 *
 * 'cullMode: none' is deliberate: MVS triangle winding is not guaranteed
 * consistent, so backface culling drops real surface at random.
 */
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import type { SceneDisplay } from '../../@types/SceneDisplay';
import type { MeshGpuAsset } from './renderResources';
import meshWireframeWgsl from './shaders/meshWireframe.wesl?static';
import texturedMeshWgsl from './shaders/texturedMesh.wesl?static';

const POSITION_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 12,
  attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
};

export type TexturedMeshRenderer = {
  draw(pass: GPURenderPassEncoder, assets: readonly MeshGpuAsset[], display: SceneDisplay): void;
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
        POSITION_LAYOUT,
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

  const wireframeModule = createShaderModuleWithDevLog(
    device,
    meshWireframeWgsl,
    'scene-mesh-wireframe',
  );

  const wireframeLayout = device.createPipelineLayout({
    label: 'scene-mesh-wireframe-layout',
    bindGroupLayouts: [cameraLayout],
  });

  const wireframePipelineFor = (openEdge: 0 | 1): GPURenderPipeline =>
    device.createRenderPipeline({
      label: `scene-mesh-wireframe-${openEdge === 1 ? 'open' : 'manifold'}`,
      layout: wireframeLayout,
      vertex: { module: wireframeModule, entryPoint: 'vs', buffers: [POSITION_LAYOUT] },
      fragment: {
        module: wireframeModule,
        entryPoint: 'fs',
        targets: [{ format: targetFormat }],
        constants: { openEdge },
      },
      primitive: { topology: 'line-list' },
      // The lines are the triangles' own vertices, so they tie with the depth
      // just written: 'less' alone would z-fight them away.
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
    });

  const manifoldWireframePipeline = wireframePipelineFor(0);
  const openWireframePipeline = wireframePipelineFor(1);

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
    draw(pass, assets, display): void {
      pass.setPipeline(pipeline);
      for (const asset of assets) {
        pass.setBindGroup(1, bindGroupFor(asset));
        pass.setVertexBuffer(0, asset.positions);
        pass.setVertexBuffer(1, asset.uvs);
        pass.setIndexBuffer(asset.indices, 'uint32');
        pass.drawIndexed(asset.indexCount);
      }
      if (!display.mesh.wireframe) return;
      pass.setPipeline(manifoldWireframePipeline);
      for (const asset of assets) {
        pass.setVertexBuffer(0, asset.positions);
        pass.setIndexBuffer(asset.manifoldEdges, 'uint32');
        pass.drawIndexed(asset.manifoldEdgeIndexCount);
      }
      // Second, so a vertex shared with a manifold edge resolves orange.
      pass.setPipeline(openWireframePipeline);
      for (const asset of assets) {
        pass.setVertexBuffer(0, asset.positions);
        pass.setIndexBuffer(asset.openEdges, 'uint32');
        pass.drawIndexed(asset.openEdgeIndexCount);
      }
    },
  };
}
