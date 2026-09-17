/**
 * createLidarPointRenderer — the point clouds as opaque screen-facing quads
 * (shaders/lidarPoint/), one instance per `points.bin` record, no CPU copy of the
 * downloaded records.
 *
 * Opaque + depth-tested is what buys the missing sort: nearest wins per pixel
 * whatever order the assets draw in.
 */
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import { POINTS_RECORD_BYTES } from '../../../scene-recon/pack/pointCloudFormat';
import type { LidarGpuAsset } from './renderResources';
import fsCode from './shaders/lidarPoint/fragment.wesl?static';
import vsCode from './shaders/lidarPoint/vertex.wesl?static';

const VERTICES_PER_POINT = 6; // lidarPoint/vertex.wesl's two-triangle quad

export type LidarPointRenderer = {
  draw(pass: GPURenderPassEncoder, assets: readonly LidarGpuAsset[]): void;
};

export function createLidarPointRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): LidarPointRenderer {
  const { device } = gpu;
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'scene-lidar-point-vs');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'scene-lidar-point-fs');

  const pipeline = device.createRenderPipeline({
    label: 'scene-lidar-point',
    layout: device.createPipelineLayout({
      label: 'scene-lidar-point-layout',
      bindGroupLayouts: [cameraLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: POINTS_RECORD_BYTES,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'unorm8x4' },
          ],
        },
      ],
    },
    fragment: { module: fsModule, entryPoint: 'fs', targets: [{ format: targetFormat }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  return {
    draw(pass, assets): void {
      pass.setPipeline(pipeline);
      for (const asset of assets) {
        pass.setVertexBuffer(0, asset.vertexBuffer);
        pass.draw(VERTICES_PER_POINT, asset.pointCount);
      }
    },
  };
}
