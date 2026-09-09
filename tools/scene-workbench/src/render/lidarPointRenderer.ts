/**
 * createLidarPointRenderer — the point clouds as opaque screen-facing quads
 * (lidarPoint.wesl), one instance per `points.bin` record, no CPU copy of the
 * downloaded records.
 *
 * Opaque + depth-tested is what buys the missing sort: nearest wins per pixel
 * whatever order the assets draw in. This is the frame's only pass, so it also
 * owns the clear — a zero-asset draw still presents a cleared frame.
 */
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import { POINTS_RECORD_BYTES } from '../../../scene-recon/pack/pointCloudFormat';
import type { LidarGpuAsset } from './renderResources';
import type { SceneCameraView } from './sceneCameraView';
import { SCENE_CAMERA_BYTES, writeSceneCamera } from './writeSceneCamera';
import lidarPointWgsl from './shaders/lidarPoint.wesl?static';

const VERTICES_PER_POINT = 6; // lidarPoint.wesl's two-triangle quad

export type LidarPointRenderer = {
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    depth: GPUTextureView,
    view: SceneCameraView,
    assets: readonly LidarGpuAsset[],
    pointSizePx: number,
  ): void;
  dispose(): void;
};

export function createLidarPointRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
): LidarPointRenderer {
  const { device } = gpu;
  const module = createShaderModuleWithDevLog(device, lidarPointWgsl, 'scene-lidar-point');

  const cameraLayout = device.createBindGroupLayout({
    label: 'scene-lidar-camera-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });

  const pipeline = device.createRenderPipeline({
    label: 'scene-lidar-point',
    layout: device.createPipelineLayout({
      label: 'scene-lidar-point-layout',
      bindGroupLayouts: [cameraLayout],
    }),
    vertex: {
      module,
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
    fragment: { module, entryPoint: 'fs', targets: [{ format: targetFormat }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  const cameraBuffer = device.createBuffer({
    label: 'scene-lidar-camera',
    size: SCENE_CAMERA_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const cameraF32 = new Float32Array(SCENE_CAMERA_BYTES / 4);
  const cameraBindGroup = device.createBindGroup({
    label: 'scene-lidar-camera',
    layout: cameraLayout,
    entries: [{ binding: 0, resource: { buffer: cameraBuffer } }],
  });

  return {
    draw(encoder, target, depth, view, assets, pointSizePx): void {
      writeSceneCamera(cameraF32, view, pointSizePx);
      device.queue.writeBuffer(cameraBuffer, 0, cameraF32);

      const pass = encoder.beginRenderPass({
        label: 'scene-lidar-point',
        colorAttachments: [
          {
            view: target,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: depth,
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, cameraBindGroup);
      for (const asset of assets) {
        pass.setVertexBuffer(0, asset.vertexBuffer);
        pass.draw(VERTICES_PER_POINT, asset.pointCount);
      }
      pass.end();
    },
    dispose(): void {
      cameraBuffer.destroy();
    },
  };
}
