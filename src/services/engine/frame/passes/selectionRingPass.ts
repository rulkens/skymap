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
 * pre-computed `ringRadiusPx`, not a galaxy diameter.  This pass owns
 * picking the per-target characteristic radius (catalog diameter vs the
 * Milky Way disc), then defers the apparent-px math to the shared
 * `selectionRingRadiusPx` helper — the SAME call the Milky-Way pick
 * billboard uses to size its hit target, so ring and click area can't
 * drift.  The `max(diameterKpc, 30)` floor here handles the synthetic-
 * fallback source and any pre-v4-format galaxy without a measured size.
 *
 * Decoupling the formula from the renderer leaves room for a structure
 * fold-in: `else if (selectedStructure !== null) { ... }` here picks up the
 * structure's visual radius without touching the renderer or shaders.
 *
 * ## Why one writeBuffer is fine
 *
 * Only one galaxy is selected per frame.  The pass is gated
 * `enabled()`-false when nothing is selected, so the 16-byte
 * selection + 80-byte camera upload only fires on frames where the
 * ring is actually visible.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../../data/milkyWay/galacticCenter';
import { selectionRingRadiusPx } from '../../helpers/selectionRingRadiusPx';

export const selectionRingPass: Pass = {
  name: 'selection-ring',

  enabled(state, _ctx, _settings) {
    if (state.gpu.selectionRingRenderer === null) return false;
    const sel = state.subsystems.selection.selected();
    // Galaxy and Milky Way targets drive the halo; structure targets render
    // through the cluster marker pass instead.
    return sel !== null && (sel.type === 'galaxyCatalog' || sel.type === 'milkyWay');
  },

  draw(pass, ctx, state, settings, _deps) {
    const sel = state.subsystems.selection.selected();
    // `enabled()` proved sel is a galaxy or Milky Way target.
    if (sel === null || (sel.type !== 'galaxyCatalog' && sel.type !== 'milkyWay')) return;

    // Both arms carry their own resolved world position (built + bounds-checked
    // at pick time / static for the MW), so there's no catalog re-index here —
    // no tier-swap race to guard either.  The characteristic radius differs:
    // a galaxy uses its catalog diameter; the Milky Way uses its disc radius.
    const worldPos: [number, number, number] = [sel.x, sel.y, sel.z];
    const radiusMpc =
      sel.type === 'milkyWay'
        ? MILKY_WAY_DISC_RADIUS_KPC / 1000
        : ((sel.diameterKpc > 0 ? sel.diameterKpc : 30) * 2) / 1000;

    // Compute the on-screen halo radius via the shared helper (the
    // Milky-Way pick billboard sizes its hit target with the same call).
    const dx = worldPos[0] - ctx.drawCamPos[0];
    const dy = worldPos[1] - ctx.drawCamPos[1];
    const dz = worldPos[2] - ctx.drawCamPos[2];
    const camDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ringRadiusPx = selectionRingRadiusPx(
      radiusMpc,
      camDist,
      ctx.drawPxPerRad,
      settings.pointSizePx,
    );

    state.gpu.selectionRingRenderer!.setSelection({ worldPos, ringRadiusPx });
    state.gpu.selectionRingRenderer!.render(pass, ctx.vp as Float32Array, [
      ctx.canvasSize.width,
      ctx.canvasSize.height,
    ]);
  },
};
