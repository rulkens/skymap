/**
 * createSplatRenderer — Gaussian splats as covariance-projected quads
 * (splat.wesl), one instance per LIVE `order` entry — `drawCount`, which the
 * depth sort shortens to the clip box's survivors — blended back-to-front over
 * the depth the lidar pass already wrote (depth-tested, never depth-writing).
 *
 * Two pipelines from one module: the deg-1 variant binds `sh1` at group 1
 * binding 1, the deg-0 variant's layout omits it — WebGPU validates a layout
 * only against what the entry point statically uses.
 */
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import type { SplatGpuAsset } from './renderResources';
import splatWgsl from './shaders/splat.wesl?static';

const VERTICES_PER_SPLAT = 6; // splat.wesl's two-triangle quad

// Straight (unpremultiplied) alpha: the fragment emits colour and alpha
// separately, so this is NOT `PREMULTIPLIED_OVER_BLEND`.
const STRAIGHT_ALPHA_BLEND: GPUBlendState = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

export type SplatRenderer = {
  draw(pass: GPURenderPassEncoder, assets: readonly SplatGpuAsset[]): void;
};

export function createSplatRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): SplatRenderer {
  const { device } = gpu;
  const module = createShaderModuleWithDevLog(device, splatWgsl, 'scene-splat');

  const storageEntry = (binding: number): GPUBindGroupLayoutEntry => ({
    binding,
    visibility: GPUShaderStage.VERTEX,
    buffer: { type: 'read-only-storage' },
  });
  const assetLayouts = {
    0: device.createBindGroupLayout({
      label: 'scene-splat-asset-deg0',
      entries: [storageEntry(0)],
    }),
    1: device.createBindGroupLayout({
      label: 'scene-splat-asset-deg1',
      entries: [storageEntry(0), storageEntry(1)],
    }),
  } as const;

  const makePipeline = (shDegree: 0 | 1): GPURenderPipeline =>
    device.createRenderPipeline({
      label: `scene-splat-deg${shDegree}`,
      layout: device.createPipelineLayout({
        label: `scene-splat-layout-deg${shDegree}`,
        bindGroupLayouts: [cameraLayout, assetLayouts[shDegree]],
      }),
      vertex: {
        module,
        entryPoint: `vs_deg${shDegree}`,
        buffers: [
          {
            arrayStride: 4,
            stepMode: 'instance',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'uint32' }],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: targetFormat, blend: STRAIGHT_ALPHA_BLEND }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
    });
  const pipelines = { 0: makePipeline(0), 1: makePipeline(1) } as const;

  // Bind groups only hold references: the asset's dispose() destroys the
  // buffers and the entry becomes unreachable with the asset.
  const bindGroups = new WeakMap<SplatGpuAsset, GPUBindGroup>();

  function bindGroupFor(asset: SplatGpuAsset): GPUBindGroup {
    const cached = bindGroups.get(asset);
    if (cached) return cached;
    const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: asset.data } }];
    if (asset.shDegree === 1) {
      if (asset.sh1 === null) {
        throw new Error('splatRenderer: shDegree 1 asset has no sh1 buffer');
      }
      entries.push({ binding: 1, resource: { buffer: asset.sh1 } });
    }
    const bindGroup = device.createBindGroup({
      label: `scene-splat-asset-deg${asset.shDegree}`,
      layout: assetLayouts[asset.shDegree],
      entries,
    });
    bindGroups.set(asset, bindGroup);
    return bindGroup;
  }

  function draw(pass: GPURenderPassEncoder, assets: readonly SplatGpuAsset[]): void {
    for (const asset of assets) {
      pass.setPipeline(pipelines[asset.shDegree]);
      pass.setBindGroup(1, bindGroupFor(asset));
      pass.setVertexBuffer(0, asset.order);
      pass.draw(VERTICES_PER_SPLAT, asset.drawCount);
    }
  }

  return { draw };
}
