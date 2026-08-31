/**
 * occlusionDepthGroup — the shared group(1) occlusion joint that both
 * near-field foreground caption renderers bind so their fragments can discard
 * behind a nearer solar-system body.
 *
 * ### The two halves of one contract
 *
 * This descriptor and the WESL `@group(1) @binding(0) var sceneDepthTex:
 * texture_depth_2d` in `shaders/lib/sceneDepth.wesl` are two halves of ONE
 * contract: a single fragment-visible depth texture at group 1, binding 0. A
 * drift between them (wrong group index, wrong sample type, wrong visibility)
 * is a device-only pipeline-validation error that a headless suite never
 * reaches — so `occlusionDepthGroup.test.ts` pins the descriptor's shape on the
 * CPU. The group INDEX is exported as a named constant, not spelled `1` inline
 * at each `setBindGroup`, so the two ends can never silently disagree.
 *
 * ### Why the bind group is rebuilt every frame
 *
 * `createOcclusionDepthBindGroup` mirrors the per-frame builder in
 * `passes/additiveUpsample.ts`: the depth view it wraps is recreated on every
 * `renderTargets.reconcile()`, so a cached bind group would eventually
 * reference a destroyed view. One bind-group allocation per frame is negligible
 * next to the caption pass it carries, and it sidesteps that trap entirely.
 */

// The group index the foreground caption pipelines bind this joint at. Named
// once here so the TS `setBindGroup(OCCLUSION_DEPTH_GROUP_INDEX, ...)` and the
// WESL `@group(1)` in sceneDepth.wesl reference a single source of truth.
export const OCCLUSION_DEPTH_GROUP_INDEX = 1;

// The bind-group-layout descriptor for the occlusion joint: a lone
// fragment-visible depth texture at binding 0. Matches the WESL
// `texture_depth_2d` — `sampleType: 'depth'` is the CPU twin of that
// unfilterable depth binding.
export const OCCLUSION_DEPTH_LAYOUT_DESC: GPUBindGroupLayoutDescriptor = {
  label: 'occlusion-depth-bgl',
  entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
  ],
};

export function createOcclusionDepthBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  depthView: GPUTextureView,
): GPUBindGroup {
  return device.createBindGroup({
    label: 'occlusion-depth-bg',
    layout,
    entries: [{ binding: 0, resource: depthView }],
  });
}
