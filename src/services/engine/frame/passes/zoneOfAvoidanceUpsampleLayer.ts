/**
 * zoneOfAvoidanceUpsampleLayer — composites the reduced-res `zoa` offscreen
 * into HDR, then draws the full-res curved lettering via `postBlit` — MSDF
 * text at reduced res would blur past legibility, so captions can't ride
 * the producer's reduced-res target.
 *
 * `postBlit` guards itself independently of the blit handle: the blit and
 * the caption must never suppress each other.
 */

import { createUpsampleLayer } from './createUpsampleLayer';
import { COSMO } from '../slabs';
import { deriveZoneOfAvoidanceLiveness } from '../zoneOfAvoidanceLiveness';

export const zoneOfAvoidanceUpsampleLayer = createUpsampleLayer({
  name: 'zone-of-avoidance-upsample',
  slab: COSMO,
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
