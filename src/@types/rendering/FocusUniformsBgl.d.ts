/**
 * FocusUniformsBgl — opaque newtype for the canonical focus-uniforms
 * bind-group layout (@group(3) on the points + pick pipelines). Same
 * identity used by every consumer pipeline.
 *
 * Like FadeUniformsBgl / SourceUniformsBgl, the newtype exists solely to
 * make accidental swaps between the three @group BGLs impossible at the
 * type level — all three are `GPUBindGroupLayout` at the GPU level, but
 * mixing them up would silently produce a wrong-binding pipeline that
 * fails validation at draw time with an unhelpful error.
 */

export type FocusUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'FocusUniformsBgl' };
