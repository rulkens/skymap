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
 * the galaxy-specific sizing math:
 *
 *   apparentPxRadius = (max(diameterKpc, 30) * 2 / 1000 / max(camDist, 0.001))
 *                      * pxPerRad
 *   ringRadiusPx    = max(pointSizePx, apparentPxRadius) * 8
 *
 * Mirrors the main-points vertex shader's selection sizing (8× halo
 * factor + apparent-pixel-radius floor) so the visible ring matches
 * the in-shader version at every zoom level.  The `max(diameterKpc,
 * 30)` floor handles the synthetic-fallback source (NaN diameter) and
 * any pre-v4-format galaxy without a measured size.
 *
 * Decoupling the formula from the renderer leaves room for a POI
 * fold-in: `else if (selectedPoi !== null) { ... }` here picks up the
 * POI's visual radius without touching the renderer or shaders.
 *
 * ## Why one writeBuffer is fine
 *
 * Only one galaxy is selected per frame.  The pass is gated
 * `enabled()`-false when nothing is selected, so the 16-byte
 * selection + 80-byte camera upload only fires on frames where the
 * ring is actually visible.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const selectionRingPass: Pass = {
  name: 'selection-ring',

  enabled(state, _ctx, _settings) {
    if (state.gpu.selectionRingRenderer === null) return false;
    return state.subsystems.selection.selected() !== null;
  },

  draw(pass, ctx, state, settings, _deps) {
    // `enabled()` proved both fields are non-null.  The `!` assertions
    // are safe: the pass framework only calls `draw` when `enabled`
    // returned true.
    const sel = state.subsystems.selection.selected()!;
    const catalog = state.sources.catalogs.get(sel.source);
    // Defensive: catalog could be evicted between `enabled()` and
    // `draw()` if a tier swap completes mid-frame.  A no-op is the
    // correct response — the next frame's `enabled()` will see the
    // updated catalog map.
    if (!catalog) return;

    const i = sel.localIdx;
    const worldPos: [number, number, number] = [
      catalog.positions[i * 3 + 0]!,
      catalog.positions[i * 3 + 1]!,
      catalog.positions[i * 3 + 2]!,
    ];

    // Compute the on-screen halo radius — same formula as the main-
    // points vertex shader (points/vertex.wesl, ringRadiusPx block).
    const diameterKpc = catalog.diameterKpc[i]!;
    const safeDiameterKpc = diameterKpc > 0 ? diameterKpc : 30;
    const dx = worldPos[0] - ctx.drawCamPos[0];
    const dy = worldPos[1] - ctx.drawCamPos[1];
    const dz = worldPos[2] - ctx.drawCamPos[2];
    const camDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const safeDist = Math.max(camDist, 0.001);
    const galaxyRadiusMpc = (safeDiameterKpc * 2) / 1000;
    const apparentPxRadius = (galaxyRadiusMpc / safeDist) * ctx.drawPxPerRad;
    const sizePx = Math.max(settings.pointSizePx, apparentPxRadius);
    const ringRadiusPx = sizePx * 8;

    state.gpu.selectionRingRenderer!.setSelection({ worldPos, ringRadiusPx });
    state.gpu.selectionRingRenderer!.render(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
    );
  },
};
