/**
 * FadeUniformsBgl — opaque newtype for the canonical fade-uniforms
 * bind-group layout. Same identity used by every consumer pipeline.
 *
 * The newtype exists solely to make accidental swaps between the fade
 * BGL and the source BGL impossible at the type level — both happen to
 * be `GPUBindGroupLayout` at the GPU level, but mixing them up would
 * silently produce a wrong-binding pipeline that fails validation at
 * draw time with an unhelpful error.
 */

export type FadeUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'FadeUniformsBgl' };
