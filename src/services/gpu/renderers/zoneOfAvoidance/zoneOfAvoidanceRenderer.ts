/**
 * zoneOfAvoidanceRenderer — translucent galactic-plane dust-band guide,
 * drawn as an analytic ray-marched shell (same family as
 * `horizonShellRenderer`: one fullscreen quad, the fragment stage
 * intersects a per-pixel view ray with geometry analytically).
 *
 * A single-instance world-anchored impostor. The band explains why the
 * catalogs thin out near the galactic plane — see the spec's Grill Q1/Q8 —
 * so it must read correctly from every camera position and distance,
 * which rules out a small proxy mesh in favour of the same camera-basis
 * ray-reconstruction technique the observable-universe shell uses.
 *
 * ### Uniform buffer ABI (112 bytes)
 *
 * See `shaders/zoneOfAvoidance/io.wesl` for the authoritative layout and
 * the byte-offset table; the summary:
 *
 *   offset 0  | vec3<f32> camForward   + f32 tanHalfFovY
 *   offset 16 | vec3<f32> camRight     + f32 aspect
 *   offset 32 | vec3<f32> camUp        + f32 innerRadiusMpc
 *   offset 48 | vec3<f32> cameraPosMpc + f32 outerRadiusMpc
 *   offset 64 | vec3<f32> color        + f32 bulgeDeg
 *   offset 80 | f32 anticenterDeg, f32 intensity, f32 radialFalloffMpc, f32 edgeSharpness
 *   offset 96 | f32 fadeAlpha, f32×3 pad
 *
 * Unlike `horizonShellRenderer`, everything stays in Mpc — the band's radii
 * (a few to a few hundred Mpc) never approach fp32's exact-integer ceiling,
 * so there's no Gpc-unit workaround to carry here.
 *
 * `radialFalloffMpc` is the one field that ISN'T a straight tuning-struct
 * copy: `ZoneOfAvoidanceTuning.radialFalloff` is documented (and dialled by
 * the DebugPanel) as a normalised [0, 1] fraction of the shell's radial
 * span, so `draw` converts it to an absolute Mpc width — the one currency
 * the shader's two smoothstep rims actually need — before writing the
 * uniform. See `draw`'s body for the conversion.
 */

import { vec3 } from 'wgpu-matrix';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../../../@types/camera/ImagePlaneBasis';
import { imagePlaneBasis } from '../../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../utils/camera/frameUp';
import vsCode from '../../shaders/zoneOfAvoidance/vertex.wesl?static';
import fsCode from '../../shaders/zoneOfAvoidance/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { ZoneOfAvoidanceRenderer } from '../../../../@types/rendering/ZoneOfAvoidanceRenderer';
import type { ZoneOfAvoidanceTuning } from '../../../../@types/settings/ZoneOfAvoidanceTuning';
import type { OrbitCamera } from '../../../../@types/camera/OrbitCamera';
import type { Vec2 } from '../../../../@types/math/Vec2';

/** On-the-wire uniform-buffer size; must match the WESL `Uniforms` struct. */
export const ZONE_OF_AVOIDANCE_UNIFORM_BUFFER_SIZE = 112;

export function createZoneOfAvoidanceRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): ZoneOfAvoidanceRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'zoneOfAvoidance.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'zoneOfAvoidance.fragment');

  const uniformBuffer = device.createBuffer({
    label: 'zoneOfAvoidance-uniform-buffer',
    size: ZONE_OF_AVOIDANCE_UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'zoneOfAvoidance-bgl-uniforms',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    label: 'zoneOfAvoidance-bg-uniforms',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const pipeline = device.createRenderPipeline({
    label: 'zoneOfAvoidance-pipeline',
    layout: device.createPipelineLayout({
      label: 'zoneOfAvoidance-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Pure additive — the band is emissive dust glow, contributing
          // light only where the latitude/radial masks are non-zero.
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
    // No depth test: the band draws into the depthless HDR target, same
    // profile as horizonShell / filaments / every other additive overlay.
  });

  // Per-frame scratch, allocated once to avoid GC churn.
  const uniforms = new ArrayBuffer(ZONE_OF_AVOIDANCE_UNIFORM_BUFFER_SIZE);
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
    tuning: ZoneOfAvoidanceTuning,
    innerRadiusMpc: number,
    outerRadiusMpc: number,
    bulgeDeg: number,
    anticenterDeg: number,
    fadeAlpha: number,
  ): void {
    // ── Camera basis (matches gl-matrix lookAt in computeViewProj) ────
    // Same derivation as horizonShellRenderer.draw — see that file's
    // header for the full rationale (rolled frame-pole basis so this
    // shell's rays agree with computeViewProj's).
    vec3.subtract(cam.target, cam.position, fwd);
    vec3.normalize(fwd, fwd);
    imagePlaneBasis(fwd, cam.roll ?? 0, frameUp(cam.upBasis, upRefScratch), basis);
    const right = basis.right;
    const up = basis.up;

    const aspect = viewport[1] > 0 ? viewport[0] / viewport[1] : cam.aspect;
    const tanHalfFovY = Math.tan(cam.fovYRad / 2);
    // The tuning knob is a normalised [0, 1] fraction of the shell's radial
    // span (see the type + this file's ABI docblock); the shader's two
    // rim smoothsteps want an absolute Mpc width, so convert here — the
    // ONE place this currency change happens, rather than splitting the
    // multiply across the shader (which would leave the uniform holding a
    // value with no name of its own).
    const radialFalloffMpc = tuning.radialFalloff * (outerRadiusMpc - innerRadiusMpc);

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
    // camUp (floats 8..10) + innerRadiusMpc (float 11).
    f32[8] = up[0];
    f32[9] = up[1];
    f32[10] = up[2];
    f32[11] = innerRadiusMpc;
    // cameraPosMpc (floats 12..14) + outerRadiusMpc (float 15).
    f32[12] = cam.position[0]!;
    f32[13] = cam.position[1]!;
    f32[14] = cam.position[2]!;
    f32[15] = outerRadiusMpc;
    // color (floats 16..18) + bulgeDeg (float 19).
    f32[16] = tuning.color[0];
    f32[17] = tuning.color[1];
    f32[18] = tuning.color[2];
    f32[19] = bulgeDeg;
    // anticenterDeg, intensity, radialFalloffMpc, edgeSharpness (floats 20..23).
    f32[20] = anticenterDeg;
    f32[21] = tuning.intensity;
    f32[22] = radialFalloffMpc;
    f32[23] = tuning.edgeSharpness;
    // fadeAlpha (float 24); floats 25..27 are pad, left at zero.
    f32[24] = fadeAlpha;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1);
  }

  function destroy(): void {
    uniformBuffer.destroy();
  }

  const renderer: ZoneOfAvoidanceRenderer = {
    label: 'zoneOfAvoidanceRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
