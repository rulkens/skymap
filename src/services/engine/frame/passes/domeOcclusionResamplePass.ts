/**
 * domeOcclusionResamplePass — the five faces' occlusion masks resampled into
 * `dome-occlusion`, the one mask the dome's overlays read on the fisheye image.
 * Off when no face wrote its mask (the mask pass switched off in the DebugPanel), so it
 * never carries a stale layer forward; a reader then finds `dome-occlusion` unrendered
 * and draws unoccluded.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';

export const domeOcclusionResamplePass: ContentPass = {
  name: 'dome-occlusion-resample',

  enabled(state, ctx) {
    return (
      state.gpu.domeResampleRenderer !== null &&
      ctx.snapshot.renderedTargets.has('dome-cube-occlusion')
    );
  },

  draw(pass, _view, ctx, state) {
    const renderer = state.gpu.domeResampleRenderer;
    if (renderer === null) return;
    renderer.drawOcclusion(pass, ctx.snapshot.renderTargets.viewOf('dome-cube-occlusion'));
  },
};
