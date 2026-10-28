/**
 * skyGridRenderer — coordinate grids on the sky as one fullscreen quad, the
 * horizonShell pattern: the CPU uploads the camera basis, and the fragment
 * builds each pixel's view ray and finds its latitude and longitude in every
 * enabled frame. Direction-only, so no world position reaches the GPU and no
 * precision is lost at any scale. Uniform layout: `shaders/skyGrid/io.wesl`.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../../@types/camera/ImagePlaneBasis';
import type { SkyGridRenderer } from '../@types/SkyGridRenderer';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import { SKY_GRID_FRAMES } from '../data/skyGridFrames';
import vsCode from '../../../services/gpu/shaders/skyGrid/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/skyGrid/fragment.wesl?static';

const HEADER_FLOATS = 12;
const FRAME_FLOATS = 16; // mat3x3 as three padded columns (12) + colour (4)
const UNIFORM_BYTES = (HEADER_FLOATS + 4 * FRAME_FLOATS) * 4;

export function createSkyGridRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): SkyGridRenderer {
  const uniformBuffer = device.createBuffer({
    label: 'skyGrid-uniform-buffer',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'skyGrid-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const bindGroup = device.createBindGroup({
    label: 'skyGrid-bg',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const pipeline = device.createRenderPipeline({
    label: 'skyGrid-pipeline',
    layout: device.createPipelineLayout({
      label: 'skyGrid-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: createShaderModuleWithDevLog(device, vsCode, 'skyGrid.vertex'),
      entryPoint: 'vs',
    },
    fragment: {
      module: createShaderModuleWithDevLog(device, fsCode, 'skyGrid.fragment'),
      entryPoint: 'fs',
      targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const f32 = new Float32Array(UNIFORM_BYTES / 4);
  // The rotations and colours never change; only each frame's on/off alpha does.
  SKY_GRID_FRAMES.forEach(({ toWorld, color }, i) => {
    const base = HEADER_FLOATS + i * FRAME_FLOATS;
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) f32[base + col * 4 + row] = toWorld[col * 3 + row]!;
    }
    f32.set(color, base + 12);
  });
  const fwd: Vec3 = [0, 0, 0];
  const upRef: Vec3 = [0, 0, 0];
  const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

  return {
    label: 'skyGridRenderer',
    draw(pass, cam, viewport, frames, opacity) {
      orbitForwardOf(cam, fwd);
      imagePlaneBasis(fwd, cam.roll ?? 0, frameUp(cam.upBasis, upRef), basis);
      f32.set(fwd, 0);
      f32[3] = Math.tan(cam.fovYRad / 2);
      f32.set(basis.right, 4);
      f32[7] = viewport[1] > 0 ? viewport[0] / viewport[1] : cam.aspect;
      f32.set(basis.up, 8);
      f32[11] = opacity;
      SKY_GRID_FRAMES.forEach(({ frame }, i) => {
        f32[HEADER_FLOATS + i * FRAME_FLOATS + 15] = frames[frame] ? 1 : 0;
      });
      device.queue.writeBuffer(uniformBuffer, 0, f32);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6, 1);
    },
    destroy() {
      uniformBuffer.destroy();
    },
  };
}
