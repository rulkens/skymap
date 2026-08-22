/**
 * zoneOfAvoidanceRenderer — translucent galactic-plane dust-band guide,
 * drawn as an analytic ray-marched shell (same family as
 * `horizonShellRenderer`): the fragment stage intersects a per-pixel view
 * ray with geometry analytically, so the band reads correctly from every
 * camera position/distance without a proxy mesh. The curved "Zone of
 * Avoidance" lettering is a `Label3DProducer` drawn by the shared
 * `label3DRenderer` (spec §9.2), not this renderer. Byte layout:
 * `shaders/zoneOfAvoidance/io.wesl` is authoritative.
 */

import { vec3 } from 'wgpu-matrix';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../../../@types/camera/ImagePlaneBasis';
import { imagePlaneBasis } from '../../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../utils/camera/frameUp';
import vsCode from '../../shaders/zoneOfAvoidance/vertex.wesl?static';
import fsCode from '../../shaders/zoneOfAvoidance/fragment.wesl?static';
import fsPickCode from '../../shaders/zoneOfAvoidance/fragmentPick.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { Source } from '../../../../data/source';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
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

  // ── Pick pipeline ───────────────────────────────────────────────────
  //
  // group(0) is never bound by this renderer, and no stage of the pick
  // pipeline reads it — it's the COSMO pick pass's shared point-pick camera
  // prefix, already bound by the time `drawPick` runs (see
  // `ContentLayer.drawPick`'s postcondition). This BGL only exists so the
  // pipeline layout is structurally compatible with it.
  const pickCameraBgl = device.createBindGroupLayout({
    label: 'zoneOfAvoidance-pick-camera-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const pickFsModule = createShaderModuleWithDevLog(
    device,
    fsPickCode,
    'zoneOfAvoidance.fragmentPick',
  );
  const pickPipeline = device.createRenderPipeline({
    label: 'zoneOfAvoidance-pick-pipeline',
    layout: device.createPipelineLayout({
      label: 'zoneOfAvoidance-pick-pipeline-layout',
      // `bindGroupLayout` is the SAME BGL `draw` binds at group(0), landing
      // at group(1) here.
      bindGroupLayouts: [pickCameraBgl, bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: pickFsModule,
      entryPoint: 'fsPick',
      // Integer target: no blend key (r32uint doesn't support blending).
      targets: [{ format: 'r32uint' }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      // COSMO's convention (slabs.ts) is non-reversed depth.
      depthCompare: resolveDepthCompare('nearer', false),
    },
  });

  // The band's pick identity never changes across its lifetime — write it
  // once directly into the shared uniform scratch below (see `packedId`'s
  // offset in io.wesl's byte table), rather than every `writeUniforms` call.
  const packedId = packSelection(Source.ZoneOfAvoidance, 0) + PICK_SENTINEL_OFFSET;

  // Per-frame scratch, allocated once to avoid GC churn.
  const uniforms = new ArrayBuffer(ZONE_OF_AVOIDANCE_UNIFORM_BUFFER_SIZE);
  const f32 = new Float32Array(uniforms);
  // packedId (float-index 25, u32) is written ONCE below and never touched
  // by writeUniforms — the packed identity never changes across frames.
  new Uint32Array(uniforms)[25] = packedId;
  // Plain Vec3 tuples (not vec3.create's Float32Array) so the per-component
  // reads below index cleanly under noUncheckedIndexedAccess.  wgpu-matrix
  // writes into them in place via the `dst` arg just the same.
  const fwd: Vec3 = [0, 0, 0];
  // Frame-pole reference up, allocated once and rewritten in place each frame.
  const upRefScratch: Vec3 = [0, 0, 0];
  // Roll-adjusted screen basis, allocated once and rewritten in place each
  // frame by `imagePlaneBasis` via its `out` argument.
  const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

  // Shared by `draw` and `drawPick`: both need the identical camera-basis +
  // shape uniforms (the pick fragment reruns the same alpha computation to
  // decide whether a fragment is even hit-testable), so the byte-packing
  // has one home. Uploads the whole buffer, including the packedId slot
  // written once above.
  function writeUniforms(
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
    // span (see the type + io.wesl's byte table); the shader's
    // exponential distance-decay term wants an absolute Mpc e-folding
    // length, so convert here — the ONE place this currency change happens,
    // rather than splitting the multiply across the shader (which would
    // leave the uniform holding a value with no name of its own).
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
    // fadeAlpha (float 24); float 25 is packedId (written once above);
    // floats 26..27 are pad, left at zero.
    f32[24] = fadeAlpha;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
  }

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
    writeUniforms(
      cam,
      viewport,
      tuning,
      innerRadiusMpc,
      outerRadiusMpc,
      bulgeDeg,
      anticenterDeg,
      fadeAlpha,
    );
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1);
  }

  // Pick twin of `draw`: same fullscreen-quad draw, same uniforms, against
  // the r32uint pick pipeline. Never binds group(0) itself — see the pick
  // pipeline's construction above for why. `bindGroup` is the SAME object
  // `draw` binds at group(0), just landing at group(1) here.
  function drawPick(
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
    writeUniforms(
      cam,
      viewport,
      tuning,
      innerRadiusMpc,
      outerRadiusMpc,
      bulgeDeg,
      anticenterDeg,
      fadeAlpha,
    );
    pass.setPipeline(pickPipeline);
    pass.setBindGroup(1, bindGroup);
    pass.draw(6, 1);
  }

  function destroy(): void {
    uniformBuffer.destroy();
  }

  const renderer: ZoneOfAvoidanceRenderer = {
    label: 'zoneOfAvoidanceRenderer',
    draw,
    drawPick,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
