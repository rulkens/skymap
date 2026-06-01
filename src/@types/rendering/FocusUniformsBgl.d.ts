/**
 * FocusUniformsBgl — opaque newtype for the canonical focus-uniforms
 * bind-group layout (@group(3) on the points + pick pipelines).
 *
 * Like FadeUniformsBgl / SourceUniformsBgl, the newtype makes accidental
 * swaps between the three @group BGLs a type error — all three are
 * `GPUBindGroupLayout` at the GPU level, but mixing them up silently
 * produces a wrong-binding pipeline that fails validation at draw time
 * with an unhelpful error.
 */

export type FocusUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'FocusUniformsBgl' };
