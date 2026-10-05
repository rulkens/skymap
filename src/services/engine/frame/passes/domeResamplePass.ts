/**
 * domeResamplePass — the fisheye resample of `dome-cube`'s five faces into
 * `hdr`, once per frame. Only `DOME_RESAMPLE` (the dome rig's program)
 * rosters this, and `dome-cube` is allocated exactly then.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';

export const domeResamplePass: ContentPass = {
  name: 'dome-resample',

  enabled(state) {
    return state.gpu.domeResampleRenderer !== null;
  },

  draw(pass, _view, ctx, state) {
    const renderer = state.gpu.domeResampleRenderer;
    if (renderer === null) return;
    renderer.draw(pass, ctx.snapshot.renderTargets.viewOf('dome-cube'));
  },
};
