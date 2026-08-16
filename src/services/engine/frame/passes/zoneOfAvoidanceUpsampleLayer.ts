/**
 * zoneOfAvoidanceUpsampleLayer — the consumer half of the ZoA guide band:
 * additively composites the reduced-res `zoa` offscreen (`zoneOfAvoidanceLayer`'s
 * raymarch) into HDR, then draws the full-res curved lettering in the same
 * HDR pass — MSDF text at reduced res would blur past legibility, so it
 * can't ride the producer's reduced-res target. Both halves gate on
 * `deriveZoneOfAvoidanceLiveness`, so this layer never composites (or
 * captions) an offscreen the producer skipped this frame, and never opens
 * against a null renderer.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { deriveZoneOfAvoidanceLiveness } from '../zoneOfAvoidanceLiveness';

/** Curved-lettering circle radius, Mpc — visual-pass placeholder. */
const LABEL_RADIUS_MPC = 40;

export const zoneOfAvoidanceUpsampleLayer: ContentLayer = {
  name: 'zone-of-avoidance-upsample',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
  },

  draw(pass, view, ctx, state) {
    // Own instance, not shared with volume's/Milky Way's (avoids braiding
    // independently-gated subsystems); either handle can be null on its own.
    if (state.gpu.zoneOfAvoidanceUpsample !== null) {
      state.gpu.zoneOfAvoidanceUpsample.draw(pass, ctx.renderTargets.viewOf('zoa'));
    }

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
};
