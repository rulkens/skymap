/**
 * createSceneCameraUniform — the SceneCamera uniform every scene renderer's
 * pipeline layout binds at group 0: buffer, layout, bind group, and the
 * per-frame write. Device-lifetime: `Viewport` builds it once after
 * `initGpu` resolves and disposes it only on unmount, never per group switch.
 */
import type { SceneCameraView } from './sceneCameraView';
import { SCENE_CAMERA_BYTES, writeSceneCamera } from './writeSceneCamera';

export type SceneCameraUniform = {
  readonly layout: GPUBindGroupLayout;
  readonly bindGroup: GPUBindGroup;
  write(view: SceneCameraView, pointSizePx: number): void;
  dispose(): void;
};

export function createSceneCameraUniform(device: GPUDevice): SceneCameraUniform {
  const layout = device.createBindGroupLayout({
    label: 'scene-camera-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const buffer = device.createBuffer({
    label: 'scene-camera',
    size: SCENE_CAMERA_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const scratch = new Float32Array(SCENE_CAMERA_BYTES / 4);
  const bindGroup = device.createBindGroup({
    label: 'scene-camera',
    layout,
    entries: [{ binding: 0, resource: { buffer } }],
  });

  return {
    layout,
    bindGroup,
    write(view, pointSizePx): void {
      writeSceneCamera(scratch, view, pointSizePx);
      device.queue.writeBuffer(buffer, 0, scratch);
    },
    dispose(): void {
      buffer.destroy();
    },
  };
}
