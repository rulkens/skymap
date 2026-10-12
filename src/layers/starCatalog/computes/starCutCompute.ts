/**
 * starCutCompute — the survey stars' octree cut, taken on the GPU from the
 * inputs the Layer's planner set this frame. A sky capture's own cut is not
 * this row's: the first capture face to draw submits it (`starCutGpu`).
 */

import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';

export function starCutCompute(runtime: StarCatalogRuntime): ContentCompute {
  return {
    name: 'star-cut',
    scope: 'once',
    encode(encoder, _ctx, _state, claimTimestampWrites) {
      runtime.renderer.encodeCut(encoder, claimTimestampWrites);
    },
  };
}
