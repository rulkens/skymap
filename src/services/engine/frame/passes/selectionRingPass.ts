/**
 * selectionRingPass — per-galaxy selection halo overlay.
 *
 * Lives at the HEAD of the swap-target layers (drawn post-tone-map) so
 * marker-lines and labels composite OVER the ring — labels carry information that should stay
 * legible when they overlap the stroke.
 *
 * ## CPU-side ringRadiusPx
 *
 * The renderer is renderer-type-agnostic: its uniform carries a
 * pre-computed `ringRadiusPx`, not a galaxy diameter.  The per-target
 * characteristic radius (Mpc) and the world position to centre on both come
 * from `selectionHaloOf`, over the kind's `focus.ring` facts — a galaxy yields
 * twice its diameter, the Milky Way its disc radius, a structure `null` (it
 * renders its ring through the cluster marker pass).
 * This layer then defers the apparent-px math to the shared
 * `selectionRingRadiusPx` helper, passing `state.settings.galaxyCatalogs.sizePx`
 * as the minimum-radius floor.  No per-kind branch is needed here: a new
 * halo-bearing kind declares its ring, and the descriptor carries the position
 * so the layer never re-narrows the union to read coordinates.
 *
 * ## Why one writeBuffer is fine
 *
 * This layer shares `state.gpu.selectionRingRenderer` — and its
 * `queue.writeBuffer`-backed camera + selection uniforms — with the NEAR0
 * `near0SelectionRingPass`.  A frame records both into one encoder with one
 * `queue.submit`, so if both drew, both draws would read the last-written
 * uniforms (the writeBuffer/submit race).  The two layers avoid that by
 * partitioning the halos by slab: this layer is
 * `enabled()`-true only for a COSMO-slab descriptor, the sibling only for
 * NEAR0.  Nothing selected, a star, or a structure leaves this layer disabled,
 * so its 16-byte selection + 80-byte camera upload fires only on frames where
 * a COSMO ring is actually visible.  See `near0SelectionRingPass`'s header for
 * the full race argument.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { COSMO } from '../slabs';
import { selectionHaloOf } from '../../helpers/selectionHaloOf';
import { selectionRingRadiusPx } from '../../helpers/selectionRingRadiusPx';
import { overlaySceneOcclusion } from '../overlaySceneOcclusion';

export const selectionRingPass: ContentPass = {
  name: 'selection-ring',

  enabled(state, _ctx, _view) {
    if (state.gpu.selectionRingRenderer === null) return false;
    const row = state.selectionRows.select;
    // A row drives THIS ring iff its kind's ring is in the COSMO slab. The slab
    // test keeps this layer and the NEAR0 sibling from both firing on the same
    // frame — they share one renderer, and only one may write its uniforms per
    // frame (see `near0SelectionRingPass`).
    const halo = selectionHaloOf(row);
    return halo !== null && halo.slab === COSMO;
  },

  draw(pass, view, ctx, state) {
    const row = state.selectionRows.select;
    // A null descriptor is the structure arm (it renders its ring through the
    // cluster marker pass).  The descriptor carries both the radius and the
    // world position, so there's no union re-narrow and no catalog re-index.
    const halo = selectionHaloOf(row);
    if (halo === null) return;
    const { radiusMpc, worldPos } = halo;

    const dx = worldPos[0] - ctx.drawCamPos[0];
    const dy = worldPos[1] - ctx.drawCamPos[1];
    const dz = worldPos[2] - ctx.drawCamPos[2];
    const camDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ringRadiusPx = selectionRingRadiusPx(
      radiusMpc,
      camDist,
      ctx.drawPxPerRad,
      state.settings.galaxyCatalogs.sizePx,
    );

    state.gpu.selectionRingRenderer!.draw(
      pass,
      view.vp,
      view.viewportPx,
      ctx.drawPxPerRad,
      // Opaque: the overflow fade the NEAR0 sibling rides is about a subject
      // that fills the viewport, which a COSMO galaxy at Mpc range never does.
      { worldPos, ringRadiusPx, alpha: 1 },
      // The ring has no per-subject weight, so handing this over IS the
      // verdict: it attenuates wherever the coverage says a body covers it.
      overlaySceneOcclusion(ctx, view),
    );
  },
};
