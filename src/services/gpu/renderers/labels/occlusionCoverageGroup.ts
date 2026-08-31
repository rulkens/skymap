/**
 * occlusionCoverageGroup — the shared group(1) occlusion joint that the
 * overlay renderers (labels, marker lines, selection ring) bind so their
 * fragments can discard where an opaque body already drew.
 *
 * ### The two halves of one contract
 *
 * This descriptor and the WESL `@group(1) @binding(0) var sceneColorTex:
 * texture_2d<f32>` in `shaders/lib/sceneDepth.wesl` are two halves of ONE
 * contract: a single fragment-visible colour texture at group 1, binding 0. A
 * drift between them (wrong group index, wrong sample type, wrong visibility)
 * is a device-only pipeline-validation error that a headless suite never
 * reaches — so `occlusionCoverageGroup.test.ts` pins the descriptor's shape on
 * the CPU. The group INDEX is exported as a named constant, not spelled `1`
 * inline at each `setBindGroup`, so the two ends can never silently disagree.
 *
 * `foreground:0`'s alpha, not its depth, is the coverage signal now: each
 * painter-chain row clears its own depth (spec §7.3), so the shared depth
 * buffer only ever holds the LAST row's value and is unusable for
 * cross-row occlusion. Alpha survives across rows (colour loads, not
 * clears, between chain steps) and accumulates under OVER compositing —
 * `coveredByScene` reads it at `> 0.5` so the opaque globe occludes but the
 * non-writing atmosphere/cloud shells do not.
 *
 * ### Why the bind group is rebuilt every frame
 *
 * `createOcclusionCoverageBindGroup` mirrors the per-frame builder in
 * `passes/additiveUpsample.ts`: the colour view it wraps is recreated on
 * every `renderTargets.reconcile()`, so a cached bind group would eventually
 * reference a destroyed view. One bind-group allocation per frame is negligible
 * next to the caption pass it carries, and it sidesteps that trap entirely.
 */

// The group index the overlay pipelines bind this joint at. Named once here
// so the TS `setBindGroup(OCCLUSION_COVERAGE_GROUP_INDEX, ...)` and the WESL
// `@group(1)` in sceneDepth.wesl reference a single source of truth.
export const OCCLUSION_COVERAGE_GROUP_INDEX = 1;

// The bind-group-layout descriptor for the occlusion joint: a lone
// fragment-visible colour texture at binding 0. Matches the WESL
// `texture_2d<f32>` read via `textureLoad` — `unfilterable-float` is the
// narrowest sampleType a `rgba16float` target needs for an unfiltered load.
export const OCCLUSION_COVERAGE_LAYOUT_DESC: GPUBindGroupLayoutDescriptor = {
  label: 'occlusion-coverage-bgl',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'unfilterable-float' },
    },
  ],
};

export function createOcclusionCoverageBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  colorView: GPUTextureView,
): GPUBindGroup {
  return device.createBindGroup({
    label: 'occlusion-coverage-bg',
    layout,
    entries: [{ binding: 0, resource: colorView }],
  });
}
