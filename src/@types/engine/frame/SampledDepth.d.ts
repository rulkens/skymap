import type { Slab } from './Slab';

/**
 * What a `{ sample }` step's passes read: the source row's depth as a texture,
 * and the slab whose clearing step wrote it last this frame — `null` with the
 * 1×1 far-cleared placeholder when nothing has cleared that depth yet.
 */
export type SampledDepth = { readonly view: GPUTextureView; readonly row: Slab | null };
