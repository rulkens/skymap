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

  enabled(state, ctx, _view) {
    return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
  },

  // `view` unused: draw takes the raw OrbitCamera (`ctx.cam`) and the
  // downscaled viewport below, not the SlabView's full-canvas vp/viewportPx.
  draw(pass, _view, ctx, state) {
    if (state.gpu.zoneOfAvoidanceRenderer === null) return;
    // Re-derive: enabled() already proved liveness, but this keeps draw pure.
    const opacity = deriveZoneOfAvoidanceLiveness(state, ctx);
    if (opacity === null) return;

    // Viewport is the 'zoa' target's allocated size (see `sizeOf`).
    const { width: vw, height: vh } = ctx.renderTargets.sizeOf('zoa');

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

  // No `pickEnabled`: the band's pick set equals its draw set, so the pick
  // program falls back to `enabled` above. The pick pass renders at full
  // canvas resolution regardless of the 'zoa' target's downsample, so the
  // viewport here is the full `canvasSize` — not the divided one `draw` uses.
  drawPick(pass, _view, ctx, state) {
    if (state.gpu.zoneOfAvoidanceRenderer === null) return;
    const opacity = deriveZoneOfAvoidanceLiveness(state, ctx);
    if (opacity === null) return;

    state.gpu.zoneOfAvoidanceRenderer.drawPick(
      pass,
      ctx.cam,
      [ctx.canvasSize.width, ctx.canvasSize.height],
      state.settings.zoneOfAvoidance,
      INNER_RADIUS_MPC,
      OUTER_RADIUS_MPC,
      BULGE_DEG,
      ANTICENTER_DEG,
      opacity,
    );
  },
};
