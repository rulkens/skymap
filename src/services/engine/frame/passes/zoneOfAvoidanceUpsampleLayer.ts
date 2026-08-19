/**
 * zoneOfAvoidanceUpsampleLayer — composites the reduced-res `zoa` offscreen
 * into HDR, then draws the full-res curved lettering via `postBlit` — MSDF
 * text at reduced res would blur past legibility, so captions can't ride
 * the producer's reduced-res target.
 *
 * `postBlit` re-derives `deriveZoneOfAvoidanceLiveness` itself rather than
 * sharing the row's `enabled` result, and null-checks its own renderer
 * handle independently of the blit's — the blit and the caption must never
 * suppress each other.
 */

import { createUpsampleLayer } from './createUpsampleLayer';
import { COSMO } from '../slabs';
import { deriveZoneOfAvoidanceLiveness } from '../zoneOfAvoidanceLiveness';

/** Curved-lettering circle radius, Mpc — visual-pass placeholder. */
const LABEL_RADIUS_MPC = 40;

export const zoneOfAvoidanceUpsampleLayer = createUpsampleLayer({
  name: 'zone-of-avoidance-upsample',
  slab: COSMO,
  sourceTargetId: 'zoa',
  handleOf: (state) => state.gpu.zoneOfAvoidanceUpsample,
  enabled(state, ctx) {
    return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
  },
  postBlit(pass, view, ctx, state) {
    if (state.gpu.zoneOfAvoidanceRenderer === null) return;
    const opacity = deriveZoneOfAvoidanceLiveness(state, ctx);
    if (opacity === null) return;
    // Same band opacity as the composite — no independent toggle/fade.
    state.gpu.zoneOfAvoidanceRenderer.drawLabels(
      pass,
      view.vp,
      view.viewportPx,
      state.settings.zoneOfAvoidance,
      LABEL_RADIUS_MPC,
      opacity,
    );
  },
});
