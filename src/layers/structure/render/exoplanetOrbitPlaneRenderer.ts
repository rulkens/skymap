/**
 * exoplanetOrbitPlaneRenderer — one system's orbit diagram as one fullscreen
 * triangle, the skyGrid pattern: the CPU uploads the camera basis and the
 * system's plane in eye-relative au, and the fragment intersects each view
 * ray with that plane. Uniform layout: `shaders/exoplanetOrbitPlane/orbitPlane.wesl`.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../../@types/camera/ImagePlaneBasis';
import type { ExoplanetOrbitPlaneRenderer } from '../@types/ExoplanetOrbitPlaneRenderer';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import shaderCode from '../../../services/gpu/shaders/exoplanetOrbitPlane/orbitPlane.wesl?static';

const MAX_ORBITS = 8;
const UNIFORM_FLOATS = 24 + MAX_ORBITS;

export function createExoplanetOrbitPlaneRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): ExoplanetOrbitPlaneRenderer {
  const uniformBuffer = device.createBuffer({
    label: 'exoplanetOrbitPlane-uniform-buffer',
    size: UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'exoplanetOrbitPlane-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const bindGroup = device.createBindGroup({
    label: 'exoplanetOrbitPlane-bg',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const module = createShaderModuleWithDevLog(device, shaderCode, 'exoplanetOrbitPlane');
  const pipeline = device.createRenderPipeline({
    label: 'exoplanetOrbitPlane-pipeline',
    layout: device.createPipelineLayout({
      label: 'exoplanetOrbitPlane-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const f32 = new Float32Array(UNIFORM_FLOATS);
  const fwd: Vec3 = [0, 0, 0];
  const upRef: Vec3 = [0, 0, 0];
  const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

  return {
    label: 'exoplanetOrbitPlaneRenderer',
    draw(pass, cam, viewport, plane) {
      orbitForwardOf(cam, fwd);
      imagePlaneBasis(fwd, cam.roll ?? 0, frameUp(cam.upBasis, upRef), basis);
      f32.fill(0);
      f32.set(fwd, 0);
      f32[3] = Math.tan(cam.fovYRad / 2);
      f32.set(basis.right, 4);
      f32[7] = viewport[1] > 0 ? viewport[0] / viewport[1] : cam.aspect;
      f32.set(basis.up, 8);
      f32[11] = plane.alpha;
      f32.set(plane.hostRelEyeAu, 12);
      f32[15] = Math.min(plane.orbitsAu.length, MAX_ORBITS);
      f32.set(plane.u, 16);
      f32[19] = plane.habitableZoneAu?.[0] ?? 0;
      f32.set(plane.v, 20);
      f32[23] = plane.habitableZoneAu?.[1] ?? 0;
      f32.set(plane.orbitsAu.slice(0, MAX_ORBITS), 24);
      device.queue.writeBuffer(uniformBuffer, 0, f32);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1);
    },
    destroy() {
      uniformBuffer.destroy();
    },
  };
}
