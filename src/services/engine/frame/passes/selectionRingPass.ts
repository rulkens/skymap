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
 *   ringRadiusPx    = max(pointSizePx, apparentPxRadius * 0.5) * RING_SIZE_SCALE
 *
 * The `* 0.5` on `apparentPxRadius` cancels half of the 4× padding the
 * points pipeline bakes into its billboard footprint (to share size with
 * the textured thumbnail) — without it, the halo balloons on zoomed-in
 * galaxies.  The `max(diameterKpc, 30)` floor handles the synthetic-
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

// Multiplier from the galaxy's base on-screen size to the halo radius.
// Tune for visual breathing room around the selected point.
const RING_SIZE_SCALE = 6;

export const selectionRingPass: Pass = {
  name: 'selection-ring',

  enabled(state, _ctx, _settings) {
    if (state.gpu.selectionRingRenderer === null) return false;
    const sel = state.subsystems.selection.selected();
    // Galaxy targets drive the halo; structure targets render through
    // the cluster marker pass instead.
    return sel !== null && sel.type === 'galaxyCatalog';
  },

  draw(pass, ctx, state, settings, _deps) {
    const sel = state.subsystems.selection.selected();
    // `enabled()` proved sel is a galaxy target — narrow accordingly.
    if (sel === null || sel.type !== 'galaxyCatalog') return;

    // The target carries its own resolved world position + diameter (built
    // + bounds-checked at pick time), so there's no catalog re-index here —
    // no tier-swap race to guard either.
    const worldPos: [number, number, number] = [sel.x, sel.y, sel.z];

    // Compute the on-screen halo radius — same formula as the main-
    // points vertex shader (points/vertex.wesl, ringRadiusPx block).
    const safeDiameterKpc = sel.diameterKpc > 0 ? sel.diameterKpc : 30;
    const dx = worldPos[0] - ctx.drawCamPos[0];
    const dy = worldPos[1] - ctx.drawCamPos[1];
    const dz = worldPos[2] - ctx.drawCamPos[2];
    const camDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const safeDist = Math.max(camDist, 0.001);
    const galaxyRadiusMpc = (safeDiameterKpc * 2) / 1000;
    const apparentPxRadius = (galaxyRadiusMpc / safeDist) * ctx.drawPxPerRad;
    // Halve the apparent-radius contribution: the points shader bakes a 4×
    // padding into the billboard footprint to share size with the textured
    // thumbnail, which would otherwise make the halo balloon when zoomed in.
    // The pointSizePx floor keeps faint, sub-pixel galaxies visibly ringed.
    const sizePx = Math.max(settings.pointSizePx, apparentPxRadius * 0.5);
    const ringRadiusPx = sizePx * RING_SIZE_SCALE;

    state.gpu.selectionRingRenderer!.setSelection({ worldPos, ringRadiusPx });
    state.gpu.selectionRingRenderer!.render(pass, ctx.vp as Float32Array, [
      ctx.canvasSize.width,
      ctx.canvasSize.height,
    ]);
  },
};
