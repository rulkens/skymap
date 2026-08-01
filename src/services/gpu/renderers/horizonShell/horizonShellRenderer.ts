/**
 * horizonShellRenderer — translucent observable-universe horizon shell,
 * drawn as an analytic ray-marched sphere.
 *
 * A single-instance world-anchored impostor.  Rather than rasterising a
 * UV-sphere mesh — which suffers
 * fp32 precision dropouts at the 14-Gpc shell radius / 30-Gpc camera
 * distances — this renderer draws ONE fullscreen quad and intersects a
 * per-pixel view ray with the sphere analytically in the fragment
 * shader.  The result is a pixel-perfect silhouette with no
 * tessellation and no per-triangle artefacts.
 *
 * ### Why Gpc units
 *
 * The ray-sphere quadratic's `dot(center, center)` term reaches ~9e8 in
 * Mpc — past fp32's exact-integer range (~1.67e7) — so the intersection
 * loses precision.  Working in GIGAPARSECS keeps that term at ~900,
 * comfortably precise.  Ray directions are unitless (normalised), so
 * only the camera position and radius carry the unit choice.
 *
 * ### Frustum-corner rays
 *
 * The four NDC-corner view-ray directions are unprojected on the CPU
 * (fp64, plain-array vec3 math), uploaded in the uniform block, selected
 * per-vertex, and interpolated across the quad — so the vertex stage
 * never multiplies a large world coordinate either.
 *
 * ### Uniform buffer ABI (64 bytes)
 *
 * See `shaders/horizonShell/io.wesl` for the authoritative layout:
 *
 *   offset 0  | vec3<f32> camForward + f32 tanHalfFovY
 *   offset 16 | vec3<f32> camRight   + f32 aspect
 *   offset 32 | vec3<f32> camUp      + f32 radiusGpc
 *   offset 48 | vec3<f32> cameraPosGpc (world pos / 1000) + f32 fadeAlpha
 */

import { vec3 } from 'wgpu-matrix';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../../../@types/camera/ImagePlaneBasis';
import { imagePlaneBasis } from '../../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../utils/camera/frameUp';
import vsCode from '../../shaders/horizonShell/vertex.wesl?static';
import fsCode from '../../shaders/horizonShell/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { HorizonShellRenderer } from '../../../../@types/rendering/HorizonShellRenderer';
import type { OrbitCamera } from '../../../../@types/camera/OrbitCamera';
import type { Vec2 } from '../../../../@types/math/Vec2';

type Init = {
  device: GPUDevice;
  /**
   * The colour-target format the shell pipeline writes into — the HDR
   * offscreen (`'rgba16float'`), NOT the swap chain. Passed explicitly (never a
   * `GpuContext.format`, which is always the swap-chain format).
   */
  targetFormat: GPUTextureFormat;
};

/** On-the-wire uniform-buffer size; must match the WESL `Uniforms` struct. */
export const HORIZON_SHELL_UNIFORM_BUFFER_SIZE = 64;

/**
 * Comoving radius to the cosmic particle horizon, in GIGAPARSECS.
 *
 * Standard flat-ΛCDM Planck-2018 cosmology gives ~14.3 Gpc for the
 * limit of light propagation since the Big Bang — also roughly where
 * the CMB last-scattering surface sits (z ≈ 1100, ~14.0 Gpc).
 */
export const HORIZON_RADIUS_GPC = 14.3;

/** Mpc → Gpc scale. */
const MPC_PER_GPC = 1000;

export function createHorizonShellRenderer(init: Init): HorizonShellRenderer {
  const { device, targetFormat } = init;

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'horizonShell.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'horizonShell.fragment');

  const uniformBuffer = device.createBuffer({
    label: 'horizonShell-uniform-buffer',
    size: HORIZON_SHELL_UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'horizonShell-bgl-uniforms',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    label: 'horizonShell-bg-uniforms',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const pipeline = device.createRenderPipeline({
    label: 'horizonShell-pipeline',
    layout: device.createPipelineLayout({
      label: 'horizonShell-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Pure additive — the shell is emissive, contributing light
          // where the Fresnel rim is bright and nothing where it isn't.
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Per-frame scratch, allocated once to avoid GC churn.
  const uniforms = new ArrayBuffer(HORIZON_SHELL_UNIFORM_BUFFER_SIZE);
  const f32 = new Float32Array(uniforms);
  // Plain Vec3 tuples (not vec3.create's Float32Array) so the per-component
  // reads below index cleanly under noUncheckedIndexedAccess.  wgpu-matrix
  // writes into them in place via the `dst` arg just the same.
  const fwd: Vec3 = [0, 0, 0];
  // Frame-pole reference up, allocated once and rewritten in place each frame.
  const upRefScratch: Vec3 = [0, 0, 0];
  // Roll-adjusted screen basis, allocated once and rewritten in place each
  // frame by `imagePlaneBasis` via its `out` argument.
  const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

  function draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    viewport: Vec2,
    fadeAlpha: number,
  ): void {
    // ── Camera basis (matches gl-matrix lookAt in computeViewProj) ────
    //
    //   forward = normalize(target - position)
    //   right   = normalize(forward × rolledUp)
    //   up      = normalize(right × forward)
    //
    // Built from the camera directly rather than by inverting the
    // view-projection (which is numerically unstable at the shell's huge
    // near:far ratio).  The right/up axes come from the shared
    // `imagePlaneBasis`, which rolls the frame pole (`frameUp(cam.upBasis)`;
    // world +Y absent a basis) about the view direction — so the shell rolls in
    // lockstep with `computeViewProj` (both read the same draw-time `upBasis`).
    vec3.subtract(cam.target, cam.position, fwd);
    vec3.normalize(fwd, fwd);
    imagePlaneBasis(fwd, cam.roll ?? 0, frameUp(cam.upBasis, upRefScratch), basis);
    const right = basis.right;
    const up = basis.up;

    const aspect = viewport[1] > 0 ? viewport[0] / viewport[1] : cam.aspect;
    const tanHalfFovY = Math.tan(cam.fovYRad / 2);

    // camForward (floats 0..2) + tanHalfFovY (float 3).
    f32[0] = fwd[0];
    f32[1] = fwd[1];
    f32[2] = fwd[2];
    f32[3] = tanHalfFovY;
    // camRight (floats 4..6) + aspect (float 7).
    f32[4] = right[0];
    f32[5] = right[1];
    f32[6] = right[2];
    f32[7] = aspect;
    // camUp (floats 8..10) + radiusGpc (float 11).
    f32[8] = up[0];
    f32[9] = up[1];
    f32[10] = up[2];
    f32[11] = HORIZON_RADIUS_GPC;
    // cameraPosGpc (floats 12..14) + fadeAlpha (float 15).
    f32[12] = cam.position[0]! / MPC_PER_GPC;
    f32[13] = cam.position[1]! / MPC_PER_GPC;
    f32[14] = cam.position[2]! / MPC_PER_GPC;
    f32[15] = fadeAlpha;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1);
  }

  function destroy(): void {
    uniformBuffer.destroy();
  }

  const renderer: HorizonShellRenderer = {
    label: 'horizonShellRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
