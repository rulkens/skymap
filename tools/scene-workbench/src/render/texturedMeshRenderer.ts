/**
 * createTexturedMeshRenderer — the MVS mesh as an indexed, unlit, opaque pass
 * (shaders/texturedMesh/) that writes depth for the splats to blend against, plus
 * the optional wireframe overlay (shaders/meshWireframe/) — WebGPU has no wireframe
 * fill mode, so the edges are line-list draws over the same positions, one per
 * edge class (manifold, then open) off one fragment module with an override constant.
 *
 * 'cullMode: none' is deliberate: MVS triangle winding is not guaranteed
 * consistent, so backface culling drops real surface at random.
 */
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import type { SceneDisplay } from '../../@types/SceneDisplay';
import type { MeshGpuAsset } from './renderResources';
import wireframeFsCode from './shaders/meshWireframe/fragment.wesl?static';
import wireframeVsCode from './shaders/meshWireframe/vertex.wesl?static';
import fsCode from './shaders/texturedMesh/fragment.wesl?static';
import vsCode from './shaders/texturedMesh/vertex.wesl?static';

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
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'scene-textured-mesh-vs');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'scene-textured-mesh-fs');

  const assetLayout = device.createBindGroupLayout({
    label: 'scene-textured-mesh-asset',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
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
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        POSITION_LAYOUT,
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
        },
      ],
    },
    fragment: { module: fsModule, entryPoint: 'fs', targets: [{ format: targetFormat }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  const wireframeVsModule = createShaderModuleWithDevLog(
    device,
    wireframeVsCode,
    'scene-mesh-wireframe-vs',
  );
  const wireframeFsModule = createShaderModuleWithDevLog(
    device,
    wireframeFsCode,
    'scene-mesh-wireframe-fs',
  );

  const wireframeLayout = device.createPipelineLayout({
    label: 'scene-mesh-wireframe-layout',
    bindGroupLayouts: [cameraLayout],
  });

  const wireframePipelineFor = (openEdge: 0 | 1): GPURenderPipeline =>
    device.createRenderPipeline({
      label: `scene-mesh-wireframe-${openEdge === 1 ? 'open' : 'manifold'}`,
      layout: wireframeLayout,
      vertex: { module: wireframeVsModule, entryPoint: 'vs', buffers: [POSITION_LAYOUT] },
      fragment: {
        module: wireframeFsModule,
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

  // Keyed by the mask buffer, not the asset: `writeMeshMask` swaps the buffer to grow it, and
  // the swap must rebuild the group. One mask per asset, so the key is still one-to-one.
  const bindGroups = new WeakMap<GPUBuffer, GPUBindGroup>();

  function bindGroupFor(asset: MeshGpuAsset): GPUBindGroup {
    const cached = bindGroups.get(asset.mask);
    if (cached) return cached;
    const bindGroup = device.createBindGroup({
      label: 'scene-textured-mesh-asset',
      layout: assetLayout,
      entries: [
        { binding: 0, resource: asset.texture.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: asset.mask } },
      ],
    });
    bindGroups.set(asset.mask, bindGroup);
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
