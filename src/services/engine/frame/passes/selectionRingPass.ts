/**
 * selectionRingPass — per-galaxy selection halo overlay.
 *
 * Lives at the HEAD of `UI_PASSES` (premultiplied-OVER, post-tone-map)
 * so marker-lines and labels composite OVER the ring — labels carry
 * information that should stay legible when they overlap the stroke.
 *
 * ## CPU-side ringRadiusPx
 *
 * The renderer is renderer-type-agnostic: its uniform carries a
 * pre-computed `ringRadiusPx`, not a galaxy diameter.  The per-target
 * characteristic radius (Mpc) and the world position to centre on both come
 * from the `selectionHalo` dispatch function, keyed on the row's union tag —
 * a galaxy yields its catalog diameter, the Milky Way its disc radius, a
 * structure `null` (it renders its ring through the cluster marker pass).
 * This pass then defers the apparent-px math to the shared
 * `selectionRingRadiusPx` helper, passing `state.settings.galaxyCatalogs.sizePx`
 * as the minimum-radius floor.  Because a structure is already a table
 * row returning null, no per-kind branch is needed here: a new halo-bearing
 * kind is one table row, and the descriptor carries the position so the pass
 * never re-narrows the union to read coordinates.
 *
 * ## Why one writeBuffer is fine
 *
 * Only one galaxy is selected per frame.  The pass is gated
 * `enabled()`-false when nothing is selected, so the 16-byte
 * selection + 80-byte camera upload only fires on frames where the
 * ring is actually visible.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import { selectionHalo } from '../../helpers/selectionHaloTable';
import { selectionRingRadiusPx } from '../../helpers/selectionRingRadiusPx';

export const selectionRingPass: Pass = {
  name: 'selection-ring',

  enabled(state, _ctx, _settings) {
    if (state.gpu.selectionRingRenderer === null) return false;
    const row = state.selectionRows.select;
    // A row drives the halo iff the table yields a descriptor for its kind.
    return selectionHalo(row) !== null;
  },

  draw(pass, ctx, state, _settings, _deps) {
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

    state.gpu.selectionRingRenderer!.draw(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
      { worldPos, ringRadiusPx },
    );
  },
};
