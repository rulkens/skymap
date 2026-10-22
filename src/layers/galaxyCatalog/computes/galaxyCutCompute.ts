/**
 * galaxyCutCompute — the octree galaxy sources' cut, taken on the GPU from the inputs
 * the Layer's planner set this frame. A sky capture's own cut is not this row's: the
 * first capture face to draw submits it (`octreeCutGpu`).
 */

import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';

export function galaxyCutCompute(runtime: GalaxyCatalogRuntime): ContentCompute {
  return {
    name: 'galaxy-cut',
    scope: 'once',
    encode(encoder, _ctx, _state, claimTimestampWrites) {
      runtime.pooledPointRenderer.encodeCut(encoder, claimTimestampWrites);
    },
  };
}
