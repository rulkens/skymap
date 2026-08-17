/**
 * SourceUniformsBgl — opaque newtype for the points-only canonical
 * source-uniforms bind-group layout. Used by both the visual
 * GalaxyPointRenderer and the offscreen PickRenderer (they share the layout
 * identity so bind groups built once can be passed to either pipeline).
 */

export type SourceUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'SourceUniformsBgl' };
