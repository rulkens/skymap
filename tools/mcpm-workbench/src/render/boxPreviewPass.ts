/**
 * createBoxPreviewPass — a transient wireframe of the PENDING grid box (mcpm/boxLines.wesl):
 * 24 vertex-pulled line-list vertices, no vertex buffers. Unlike the agent-fed passes, this
 * one needs neither the harness nor a box at construction — its uniforms are rewritten every
 * draw call — so RenderGraph builds it EAGERLY alongside itself, and a shader compile error
 * surfaces at the graph's own construction rather than waiting on a harness rebuild.
 *
 * `builtBox` (the camera's own voxel frame, via writeMcpmCamera) and `pendingBox` (what the
 * host converts into that same frame) are deliberately two different GridBoxes — the whole
 * point is previewing a box the harness hasn't been rebuilt onto yet.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';
import { worldToVoxel } from '../field/worldToVoxel';
import { MCPM_CAMERA_BYTES, writeMcpmCamera, type McpmCameraView } from './writeMcpmCamera';
import boxLinesWgsl from '../../../../src/services/gpu/shaders/mcpm/boxLines.wesl?static';

export type BoxPreviewPass = {
  /** Draw `pendingBox`'s wireframe, converted into `builtBox`'s voxel frame, into `target`. */
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    view: McpmCameraView,
    builtBox: GridBox,
    pendingBox: GridBox,
  ): void;
  dispose(): void;
};

// BoxUniform: boxMin vec3+pad, boxMax vec3+pad — boxLines.wesl's struct, 16-byte aligned.
const BOX_UNIFORM_BYTES = 32;
const LINE_VERTICES = 24; // boxLines.wesl's EDGE_CORNERS: 12 edges x 2 endpoints.

function worldBounds(box: GridBox): { min: Vec3; max: Vec3 } {
  const half: Vec3 = [box.sizeMpc[0] / 2, box.sizeMpc[1] / 2, box.sizeMpc[2] / 2];
  return {
    min: [box.centerMpc[0] - half[0], box.centerMpc[1] - half[1], box.centerMpc[2] - half[2]],
    max: [box.centerMpc[0] + half[0], box.centerMpc[1] + half[1], box.centerMpc[2] + half[2]],
  };
}

export function createBoxPreviewPass(opts: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
}): BoxPreviewPass {
  const { device } = opts;
  const module = opts.makeShader(boxLinesWgsl, 'mcpm-box-preview');

  const camLayout = device.createBindGroupLayout({
    label: 'mcpm-box-preview-camera-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const boxLayout = device.createBindGroupLayout({
    label: 'mcpm-box-preview-box-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });

  const pipeline = device.createRenderPipeline({
    label: 'mcpm-box-preview',
    layout: device.createPipelineLayout({
      label: 'mcpm-box-preview-layout',
      bindGroupLayouts: [camLayout, boxLayout],
    }),
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [
        {
          format: opts.targetFormat,
          // Additive and premultiplied, one/one — same convention as every other layer.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'line-list' },
  });

  const camBuffer = device.createBuffer({
    label: 'mcpm-box-preview-camera',
    size: MCPM_CAMERA_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const camF32 = new Float32Array(MCPM_CAMERA_BYTES / 4);
  const camBindGroup = device.createBindGroup({
    label: 'mcpm-box-preview-camera',
    layout: camLayout,
    entries: [{ binding: 0, resource: { buffer: camBuffer } }],
  });

  const boxBuffer = device.createBuffer({
    label: 'mcpm-box-preview-box',
    size: BOX_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const boxF32 = new Float32Array(BOX_UNIFORM_BYTES / 4);
  const boxBindGroup = device.createBindGroup({
    label: 'mcpm-box-preview-box',
    layout: boxLayout,
    entries: [{ binding: 0, resource: { buffer: boxBuffer } }],
  });

  return {
    draw(
      encoder: GPUCommandEncoder,
      target: GPUTextureView,
      view: McpmCameraView,
      builtBox: GridBox,
      pendingBox: GridBox,
    ): void {
      writeMcpmCamera(camF32, builtBox, view);
      device.queue.writeBuffer(camBuffer, 0, camF32);

      const bounds = worldBounds(pendingBox);
      boxF32.set(worldToVoxel(builtBox, bounds.min), 0);
      boxF32.set(worldToVoxel(builtBox, bounds.max), 4);
      device.queue.writeBuffer(boxBuffer, 0, boxF32);

      const pass = encoder.beginRenderPass({
        label: 'mcpm-box-preview',
        colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, camBindGroup);
      pass.setBindGroup(1, boxBindGroup);
      pass.draw(LINE_VERTICES);
      pass.end();
    },
    dispose(): void {
      camBuffer.destroy();
      boxBuffer.destroy();
    },
  };
}
