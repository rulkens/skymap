/**
 * What a `mask: { sample }` step's passes read: the source row's colour as a texture, or
 * `null` when no step has written that row this frame (a stale mask is never handed out).
 */
export type SampledMask = { readonly view: GPUTextureView | null };
