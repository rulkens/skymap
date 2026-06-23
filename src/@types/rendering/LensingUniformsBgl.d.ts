/**
 * LensingUniformsBgl — opaque newtype for the canonical lensing-uniforms
 * bind-group layout, shared by the points pipeline (read in the vertex
 * stage) and, in a later phase, the MCPM volume raymarch (read in the
 * fragment stage).
 *
 * Like FocusUniformsBgl / FadeUniformsBgl / SourceUniformsBgl, the brand
 * makes accidental swaps between the @group BGLs a type error — all are
 * `GPUBindGroupLayout` at the GPU level, but mixing them up silently
 * produces a wrong-binding pipeline that fails validation at draw time with
 * an unhelpful error.
 */

export type LensingUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'LensingUniformsBgl' };
