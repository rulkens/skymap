/**
 * selectionRingLayer — per-galaxy selection halo overlay.
 *
 * Lives at the HEAD of the swap-target layers (the `blend: 'over'` group
 * within `CONTENT_LAYERS`, drawn post-tone-map) so marker-lines and labels
 * composite OVER the ring — labels carry information that should stay
 * legible when they overlap the stroke.
 *
 * ## CPU-side ringRadiusPx
 *
 * The renderer is renderer-type-agnostic: its uniform carries a
 * pre-computed `ringRadiusPx`, not a galaxy diameter.  The per-target
 * characteristic radius (Mpc) and the world position to centre on both come
 * from the `selectionHalo` dispatch function, keyed on the row's union tag —
 * a galaxy yields its catalog diameter, the Milky Way its disc radius, a
 * structure `null` (it renders its ring through the cluster marker pass).
 * This layer then defers the apparent-px math to the shared
 * `selectionRingRadiusPx` helper, passing `state.settings.galaxyCatalogs.sizePx`
 * as the minimum-radius floor.  Because a structure is already a table
 * row returning null, no per-kind branch is needed here: a new halo-bearing
 * kind is one table row, and the descriptor carries the position so the layer
 * never re-narrows the union to read coordinates.
 *
 * ## Why one writeBuffer is fine
 *
 * This layer shares `state.gpu.selectionRingRenderer` — and its
 * `queue.writeBuffer`-backed camera + selection uniforms — with the NEAR0
 * `near0SelectionRingLayer`.  A frame records both into one encoder with one
 * `queue.submit`, so if both drew, both draws would read the last-written
 * uniforms (the writeBuffer/submit race).  The two layers avoid that by
 * partitioning the `selectionHalo` table by slab: this layer is
 * `enabled()`-true only for a COSMO-slab descriptor, the sibling only for
 * NEAR0.  Nothing selected, a star, or a structure leaves this layer disabled,
 * so its 16-byte selection + 80-byte camera upload fires only on frames where
 * a COSMO ring is actually visible.  See `near0SelectionRingLayer`'s header for
 * the full race argument.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { selectionHalo } from '../../helpers/selectionHaloTable';
import { selectionRingRadiusPx } from '../../helpers/selectionRingRadiusPx';

export const selectionRingLayer: ContentLayer = {
  name: 'selection-ring',
  slab: COSMO,
  target: 'swap',
  blend: 'over',

  enabled(state, _ctx, _view) {
    if (state.gpu.selectionRingRenderer === null) return false;
    const row = state.selectionRows.select;
    // A row drives THIS ring iff the table yields a COSMO-slab descriptor for
    // its kind. The slab test is what keeps this layer and the NEAR0 sibling
    // from both firing on the same frame — they share one renderer, and only
    // one may write its uniforms per frame (see `near0SelectionRingLayer`).
    const halo = selectionHalo(row);
    return halo !== null && halo.slab === COSMO;
  },

  draw(pass, view, ctx, state) {
    const row = state.selectionRows.select;
    // A null descriptor is the structure arm (it renders its ring through the
    // cluster marker pass).  The descriptor carries both the radius and the
    // world position, so there's no union re-narrow and no catalog re-index —
    // each kind's position is resolved in the table.
    const halo = selectionHalo(row);
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

    // Occlude the ring per-pixel behind nearer bodies ONLY when the body pass
    // actually ran this frame — else the `foreground:0` depth is stale/absent
    // and would spuriously discard the whole ring. When undefined, the
    // occlusion renderer falls back to its plain pipeline and draws the ring
    // un-occluded. Mirrors `markerLinesLayer`'s guard.
    const depthView = ctx.renderedTargets.has('foreground:0')
      ? ctx.renderTargets.depthViewOf('foreground:0')
      : undefined;

    state.gpu.selectionRingRenderer!.draw(
      pass,
      view.vp,
      view.viewportPx,
      { worldPos, ringRadiusPx },
      depthView,
    );
  },
};
