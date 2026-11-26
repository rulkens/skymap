/**
 * dualSourceBlend — the atmosphere's MULTIPLY + ADD pair as one blend:
 * `dst = emission + dst * transmit`, per channel, with `@blend_src(0)` the emission
 * and `@blend_src(1)` the transmittance. Alpha lands where the pair leaves it
 * (`coverage + dst.a * (1 - coverage)`). Needs the optional `dual-source-blending`
 * device feature, which iOS, Safari and about a quarter of Android lack, so the
 * two-draw pair stays as the fallback.
 */

export const DUAL_SOURCE_FEATURE: GPUFeatureName = 'dual-source-blending';

// The casts: TypeScript's own DOM typings win over `@webgpu/types` here and do not
// list the `src1` factors yet.
export const DUAL_SOURCE_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'src1' as GPUBlendFactor, operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'src1-alpha' as GPUBlendFactor, operation: 'add' },
};
