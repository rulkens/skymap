/**
 * occlusionCoverageGroup — the shared group(1) occlusion joint that the
 * overlay renderers (labels, marker lines, selection ring) bind so their
 * fragments fall off where the foreground bodies already cover the background.
 *
 * ### The two halves of one contract
 *
 * This descriptor and the three `@group(1)` declarations in
 * `shaders/lib/sceneDepth.wesl` are two halves of ONE contract: a
 * fragment-visible colour texture at binding 0, the sampled scene depth at
 * binding 1, and the km frame that unprojects it at binding 2. A drift between
 * them (wrong group index, wrong sample type, wrong visibility) is a
 * device-only pipeline-validation error that a headless suite never reaches —
 * so `occlusionCoverageGroup.test.ts` pins the descriptor's shape on the CPU.
 * The group INDEX is exported as a named constant, not spelled `1` inline at
 * each `setBindGroup`, so the two ends can never silently disagree.
 *
 * `foreground:0`'s alpha, not its depth, is the COVERAGE signal: each
 * painter-chain row clears its own depth (spec §7.3), so the shared depth
 * buffer only ever holds the LAST row's value and is unusable for
 * cross-row occlusion. Alpha survives across rows (colour loads, not
 * clears, between chain steps) and accumulates under OVER compositing —
 * `sceneTransmittance` reads it as the overlay's attenuation factor. Bindings
 * 1–2 answer a different question: WHICH SIDE of that one row's terrain the
 * overlay's own subject is on, which alpha alone cannot say.
 *
 * ### Why the bind group is rebuilt every frame
 *
 * `createOcclusionCoverageBindGroup` mirrors the per-frame builder in
 * `passes/additiveUpsample.ts`: the colour view it wraps is recreated on
 * every `renderTargets.reconcile()`, so a cached bind group would eventually
 * reference a destroyed view. One bind-group allocation per frame is negligible
 * next to the caption pass it carries, and it sidesteps that trap entirely.
 */

import type { OverlaySceneOcclusion } from '../../../../@types/rendering/OverlaySceneOcclusion';
import type { SampledDepthKmFrame } from '../../../../@types/rendering/SampledDepthKmFrame';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';

// The group index the overlay pipelines bind this joint at. Named once here
// so the TS `setBindGroup(OCCLUSION_COVERAGE_GROUP_INDEX, ...)` and the WESL
// `@group(1)` in sceneDepth.wesl reference a single source of truth.
export const OCCLUSION_COVERAGE_GROUP_INDEX = 1;

// The bind-group-layout descriptor for the occlusion joint. Binding 0 matches
// the WESL `texture_2d<f32>` read via `textureLoad` — `unfilterable-float` is
// the narrowest sampleType a `rgba16float` target needs for an unfiltered load.
export const OCCLUSION_COVERAGE_LAYOUT_DESC: GPUBindGroupLayoutDescriptor = {
  label: 'occlusion-coverage-bgl',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'unfilterable-float' },
    },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
  ],
};

/**
 * Byte offsets of the binding-2 uniform, mirroring `SampledDepthFrame` in
 * `shaders/lib/sceneDepth.wesl`. Named rather than inline because a silent
 * drift here writes the camera where the shader reads padding — the same trap
 * `OCCLUDER_*_OFFSET` in `orbitTrailRenderer.ts` names for its own twin. The
 * `vec3` ends at 76 and the following `vec2` aligns to 8, so 80, and WGSL
 * rounds the struct up to its 16-byte alignment.
 */
export const OCCLUSION_DEPTH_INV_MVP_OFFSET = 0;
export const OCCLUSION_DEPTH_CAM_POS_OFFSET = 64; // mat4x4<f32>
export const OCCLUSION_DEPTH_VIEWPORT_OFFSET = 80;
export const OCCLUSION_DEPTH_UNIFORM_BYTES = 96;

/** Column-major identity, packed alongside the far-cleared placeholder view
 *  when the frame is unresolved — the shader's FAR_DEPTH arm never reads it. */
const IDENTITY_MAT4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Its companion for the same unresolved-frame draw, hoisted so that draw
 *  allocates nothing. */
const ZERO_VEC3: Vec3 = [0, 0, 0];

// One scratch for all three overlay renderers: `writeBuffer` copies at call
// time, so nothing outlives the call that filled it.
const frameScratch = new ArrayBuffer(OCCLUSION_DEPTH_UNIFORM_BYTES);
const frameInvMvp = new Float32Array(frameScratch, OCCLUSION_DEPTH_INV_MVP_OFFSET, 16);
const frameCamPosKm = new Float32Array(frameScratch, OCCLUSION_DEPTH_CAM_POS_OFFSET, 3);
const frameViewportPx = new Float32Array(frameScratch, OCCLUSION_DEPTH_VIEWPORT_OFFSET, 2);

/** Upload the binding-2 record. A null frame zeroes the camera and packs the
 *  identity, which pairs only with the far-cleared placeholder view. */
export function writeOcclusionDepthFrame(
  device: GPUDevice,
  buffer: GPUBuffer,
  frame: SampledDepthKmFrame | null,
  viewportPx: Readonly<Vec2>,
): void {
  frameInvMvp.set(frame === null ? IDENTITY_MAT4 : frame.invMvp);
  frameCamPosKm.set(frame === null ? ZERO_VEC3 : frame.camPosKm);
  frameViewportPx.set(viewportPx);
  device.queue.writeBuffer(buffer, 0, frameScratch);
}

export function createOcclusionCoverageBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  scene: OverlaySceneOcclusion,
  frameBuffer: GPUBuffer,
): GPUBindGroup {
  return device.createBindGroup({
    label: 'occlusion-coverage-bg',
    layout,
    entries: [
      { binding: 0, resource: scene.colorView },
      { binding: 1, resource: scene.depthView },
      { binding: 2, resource: { buffer: frameBuffer } },
    ],
  });
}

/** The binding-2 buffer an occluding renderer owns, one per instance. */
export function createOcclusionDepthFrameBuffer(device: GPUDevice, label: string): GPUBuffer {
  return device.createBuffer({
    label,
    size: OCCLUSION_DEPTH_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}
