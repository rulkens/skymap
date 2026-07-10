/**
 * starPointsLayer — the far-partition stars (Proxima and the rest of the
 * local map) as additive point sprites in the depthless HDR accumulation.
 *
 * ### The odd row out: `hdr` target, NEAR0 slab
 *
 * Every other hdr layer projects through the COSMO slab, but COSMO's near
 * plane (0.01 Mpc) would clip the parsec-scale star anchors, so this row
 * projects through NEAR0 — whose near/far track the camera's orbit
 * distance — while still accumulating into the HDR target so the stars ride
 * the same tone-map as the galaxies. The frame program carries a dedicated
 * `(hdr, NEAR0)` render step for it, placed after the `(hdr, COSMO)` step
 * and before the hdr→swap composite.
 *
 * ### Why `view.vp` (the f32 narrow), NOT the f64 seam
 *
 * The sphere-body layers feed `composeBodyMvp` the slab's `Float64Array`
 * vp because camera-relative f32 error is visible as surface swim on a
 * sphere-filling body. A star drawn as a point subtends under a pixel by
 * definition, so the f32 narrowing error (relative eps ~1e-7) stays
 * sub-pixel at any camera distance that shows it as a point at all — the
 * same rationale as the caption anchors in `foregroundLabelsLayer`. The
 * renderer's instance buffer already carries f32 positions for the same
 * reason (see `starPointRenderer`'s precision note).
 *
 * ### When it draws
 *
 * `enabled` gates on the `starPointRenderer` GPU handle (null in the
 * pre-bootstrap window) AND a non-empty far partition of the seeded stars.
 * The star instances themselves were uploaded once by `initGpu` via
 * `setStars` (data delivery is a bootstrap concern, like the Earth's
 * texture fetch), so `draw` stays a pure draw — no uploads mid-pass.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { isNearStar } from '../../../../utils/scene/isNearStar';

export const starPointsLayer: ContentLayer = {
  name: 'star-points',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state) {
    // Handle first, partition second: the handle check short-circuits so
    // pre-bootstrap fixtures (null renderer, no bodies bag) never touch
    // state.data.
    return (
      state.gpu.starPointRenderer !== null &&
      state.data.bodies.stars.some((star) => !isNearStar(star))
    );
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.starPointRenderer;
    if (renderer === null) return;
    // The f32 narrow suffices for point anchors — see the module header.
    renderer.draw(pass, view.vp, view.viewportPx);
  },
};
