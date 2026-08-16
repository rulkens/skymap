/**
 * zoneOfAvoidanceLayer — the reduced-res producer half of the ZoA guide
 * band: ray-marches the shell into the reduced-res `zoa` offscreen (a
 * full-res march is needless cost — the band is smooth low-frequency haze
 * an upsample reconstructs losslessly). The consumer,
 * `zoneOfAvoidanceUpsampleLayer`, composites this into HDR and draws the
 * full-res lettering. Both gate on `deriveZoneOfAvoidanceLiveness`, which
 * also carries the renderer-null check, so producer/consumer can't disagree
 * and no empty pass opens pre-bootstrap.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { deriveZoneOfAvoidanceLiveness } from '../zoneOfAvoidanceLiveness';

// Shell shape — visual-pass placeholders, Mpc / degrees.
const INNER_RADIUS_MPC = 3;
const OUTER_RADIUS_MPC = 380;
const BULGE_DEG = 10;
const ANTICENTER_DEG = 3;

export const zoneOfAvoidanceLayer: ContentLayer = {
  name: 'zone-of-avoidance',
  slab: COSMO,
  target: 'zoa',
  blend: 'additive',

  enabled(state, ctx) {
    return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
  },

  // `view` unused: draw takes the raw OrbitCamera (`ctx.cam`) and the
  // downscaled viewport below, not the SlabView's full-canvas vp/viewportPx.
  draw(pass, _view, ctx, state) {
    if (state.gpu.zoneOfAvoidanceRenderer === null) return;
    // Re-derive: enabled() already proved liveness, but this keeps draw pure.
    const opacity = deriveZoneOfAvoidanceLiveness(state, ctx);
    if (opacity === null) return;

    // Viewport matches the 'zoa' target's own size (aspect uniform); divisor
    // read off the spec row keeps it single-homed with the render-target table.
    const scale = ctx.renderTargets.specs.find((s) => s.id === 'zoa')!.scale;
    const vw = Math.max(1, Math.floor(ctx.canvasSize.width / scale));
    const vh = Math.max(1, Math.floor(ctx.canvasSize.height / scale));

    state.gpu.zoneOfAvoidanceRenderer.draw(
      pass,
      ctx.cam,
      [vw, vh],
      state.settings.zoneOfAvoidance,
      INNER_RADIUS_MPC,
      OUTER_RADIUS_MPC,
      BULGE_DEG,
      ANTICENTER_DEG,
      opacity,
    );
  },
};
