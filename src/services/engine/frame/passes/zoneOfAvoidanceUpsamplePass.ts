/**
 * zoneOfAvoidanceUpsamplePass — composites the reduced-res `zoa` offscreen
 * into HDR, then draws the full-res curved lettering via `postBlit` — MSDF
 * text at reduced res would blur past legibility, so captions can't ride
 * the producer's reduced-res target.
 *
 * `postBlit` guards itself independently of the blit handle: the blit and
 * the caption must never suppress each other.
 */

import { createUpsamplePass } from './createUpsamplePass';
import { deriveZoneOfAvoidanceLiveness } from '../zoneOfAvoidanceLiveness';

export const zoneOfAvoidanceUpsamplePass = createUpsamplePass({
  name: 'zone-of-avoidance-upsample',
  sourceTargetId: 'zoa',
  handleOf: (state) => state.gpu.zoneOfAvoidanceUpsample,
  enabled(state, ctx) {
    return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
  },
  postBlit(pass, view, _ctx, state) {
    const r = state.gpu.label3DRenderer;
    if (r === null || r.glyphCount() === 0) return;
    r.draw(pass, view.vp, view.viewportPx);
  },
});
