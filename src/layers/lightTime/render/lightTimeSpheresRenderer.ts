/**
 * lightTimeSpheresRenderer — one ray–sphere draw for every visible light-time
 * sphere. Radii span ~1e-14..3e2 Mpc, so the shader works in sphere-radius
 * units: the CPU reduces each sphere to `ro` and `c` in f64 and only the
 * results round to f32. The quad covers just the largest visible sphere's
 * screen rect; the spheres are concentric, so that rect encloses the rest.
 *
 * Uniform layout: TWIN `shaders/lightTime/io.wesl` (192 bytes).
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { ImagePlaneBasis } from '../../../@types/camera/ImagePlaneBasis';
import type { LightTimeSpheresRenderer } from '../@types/LightTimeSpheresRenderer';
import type { LightTimeLiveness } from '../@types/LightTimeLiveness';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';
import { sphereNdcBounds } from '../../../utils/math/sphereNdcBounds';
import { LIGHT_TIME_SPHERES } from '../../../data/lightTime/lightTimeSpheres';
import vsCode from '../../../services/gpu/shaders/lightTime/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/lightTime/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';

/** Slots in the WESL `spheres` array; the distance window never opens more at once. */
const MAX_VISIBLE = 4;
const FORWARD_FLOAT_OFFSET = 0;
const TAN_HALF_FOV_Y_FLOAT_OFFSET = 3;
const RIGHT_FLOAT_OFFSET = 4;
const ASPECT_FLOAT_OFFSET = 7;
const UP_FLOAT_OFFSET = 8;
const COUNT_FLOAT_OFFSET = 11;
const RECT_FLOAT_OFFSET = 12;
const SPHERES_FLOAT_OFFSET = 16;
const FLOATS_PER_SPHERE = 8;
/** Within a slot: `ro.xyz`, then opacity, then `c`. */
const SLOT_OPACITY_FLOAT_OFFSET = 3;
const SLOT_C_FLOAT_OFFSET = 4;
const UNIFORM_FLOATS = SPHERES_FLOAT_OFFSET + MAX_VISIBLE * FLOATS_PER_SPHERE;
const UNIFORM_BUFFER_SIZE = UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT;
/** NDC slack: the rim is brightest exactly on the silhouette the rect is cut to. */
const RECT_PAD = 0.01;

export function createLightTimeSpheresRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): LightTimeSpheresRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'lightTime.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'lightTime.fragment');

  const uniformBuffer = device.createBuffer({
    label: 'lightTime-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'lightTime-bgl-uniforms',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const bindGroup = device.createBindGroup({
    label: 'lightTime-bg-uniforms',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const pipeline = device.createRenderPipeline({
    label: 'lightTime-pipeline',
    layout: device.createPipelineLayout({
      label: 'lightTime-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Per-frame scratch, allocated once.
  const f32 = new Float32Array(UNIFORM_FLOATS);
  const fwd: Vec3 = [0, 0, 0];
  const upRef: Vec3 = [0, 0, 0];
  const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

  function draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    camPos: Readonly<Vec3>,
    viewport: Vec2,
    liveness: LightTimeLiveness,
  ): void {
    // Same basis `computeViewProj`'s lookAt derives, so the rays match the scene.
    orbitForwardOf(cam, fwd);
    imagePlaneBasis(fwd, cam.roll ?? 0, frameUp(cam.upBasis, upRef), basis);
    const { right, up } = basis;
    const tanHalfFovY = Math.tan(cam.fovYRad / 2);
    const aspect = viewport[0] / viewport[1];

    const { centre, opacities } = liveness;
    const eyeX = camPos[0] - centre[0];
    const eyeY = camPos[1] - centre[1];
    const eyeZ = camPos[2] - centre[2];

    let count = 0;
    let largestRadius = 0;
    for (let i = 0; i < LIGHT_TIME_SPHERES.length && count < MAX_VISIBLE; i++) {
      const opacity = opacities[i] ?? 0;
      if (!(opacity > 0)) continue;
      // Ascending table, so the last packed sphere is the largest.
      largestRadius = LIGHT_TIME_SPHERES[i]!.radiusMpc;
      const roX = eyeX / largestRadius;
      const roY = eyeY / largestRadius;
      const roZ = eyeZ / largestRadius;
      const slot = SPHERES_FLOAT_OFFSET + count * FLOATS_PER_SPHERE;
      f32[slot] = roX;
      f32[slot + 1] = roY;
      f32[slot + 2] = roZ;
      f32[slot + SLOT_OPACITY_FLOAT_OFFSET] = opacity;
      f32[slot + SLOT_C_FLOAT_OFFSET] = roX * roX + roY * roY + roZ * roZ - 1;
      count++;
    }

    // Sphere centre in camera space: centre − eye on the three basis axes.
    const x = -(eyeX * right[0] + eyeY * right[1] + eyeZ * right[2]);
    const y = -(eyeX * up[0] + eyeY * up[1] + eyeZ * up[2]);
    const depth = -(eyeX * fwd[0] + eyeY * fwd[1] + eyeZ * fwd[2]);
    // Wholly behind the eye: nothing to draw.
    if (depth <= -largestRadius) return;
    const [minX, maxX] = sphereNdcBounds(x, depth, largestRadius, tanHalfFovY * aspect, RECT_PAD);
    const [minY, maxY] = sphereNdcBounds(y, depth, largestRadius, tanHalfFovY, RECT_PAD);

    f32.set(fwd, FORWARD_FLOAT_OFFSET);
    f32[TAN_HALF_FOV_Y_FLOAT_OFFSET] = tanHalfFovY;
    f32.set(right, RIGHT_FLOAT_OFFSET);
    f32[ASPECT_FLOAT_OFFSET] = aspect;
    f32.set(up, UP_FLOAT_OFFSET);
    f32[COUNT_FLOAT_OFFSET] = count;
    f32[RECT_FLOAT_OFFSET] = minX;
    f32[RECT_FLOAT_OFFSET + 1] = minY;
    f32[RECT_FLOAT_OFFSET + 2] = maxX;
    f32[RECT_FLOAT_OFFSET + 3] = maxY;
    device.queue.writeBuffer(uniformBuffer, 0, f32);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1);
  }

  return {
    label: 'lightTimeSpheresRenderer',
    draw,
    destroy: () => uniformBuffer.destroy(),
  };
}
