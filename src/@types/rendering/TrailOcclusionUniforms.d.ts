/**
 * TrailOcclusionUniforms — a reusable CPU image of `OcclusionUniforms` in
 * `shaders/lib/trailOcclusion.wesl`, made by `createTrailOcclusionUniforms`.
 */

import type { SampledDepthBinding } from './SampledDepthBinding';

export type TrailOcclusionUniforms = {
  /** The bytes to `writeBuffer` after `write`. */
  readonly scratch: ArrayBuffer;
  write(
    occluders: { readonly count: number; readonly spheresKm: Float32Array },
    depthFrame: SampledDepthBinding['frame'],
    viewportPx: ArrayLike<number>,
  ): void;
};
