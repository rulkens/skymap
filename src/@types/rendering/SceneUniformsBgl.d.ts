/**
 * SceneUniformsBgl — opaque newtype for the canonical scene-state
 * bind-group layout (@group(3) on the points + pick pipelines): cluster
 * focus + gravitational lensing, the per-frame global galaxy modifiers.
 *
 * Like FadeUniformsBgl / SourceUniformsBgl, the newtype makes accidental
 * swaps between the three @group BGLs a type error — all three are
 * `GPUBindGroupLayout` at the GPU level, but mixing them up silently
 * produces a wrong-binding pipeline that fails validation at draw time
 * with an unhelpful error.
 */

export type SceneUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'SceneUniformsBgl' };
