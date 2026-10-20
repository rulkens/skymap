/**
 * createStructureMarkersPass — shared factory behind the cosmic and Milky Way
 * marker passes: halo + ring draws into the hdr layer for one scale's structure
 * categories, plus their ring pick. The slabs differ only in which bands gate
 * the pass and which renderer handle it drives.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StructureMarkersPassSpec } from '../@types/StructureMarkersPassSpec';
import { STRUCTURE_IDS_BY_SCALE } from '../../../data/structure/structureIdsByScale';

export function createStructureMarkersPass(
  spec: StructureMarkersPassSpec,
): ContentPass<'structureRing'> {
  const { renderer, planner } = spec;
  const ids = STRUCTURE_IDS_BY_SCALE[spec.scale];
  // Core skips the pass only when every category is 0; this pass owns one scale's, so it
  // drops out once its own are all 0 (the other scale's rings may still be live).
  const live = (fade: Readonly<Record<string, number>>) => ids.some((id) => fade[id] !== 0);

  return {
    name: spec.name,
    fade: 'structureRing',

    enabled(_state, ctx, _view, fade) {
      // Value before plan: the (hdr, NEAR0) group must empty from the handed value alone,
      // without reading this frame's plans. The PLANNED list, never the renderer's marker
      // count: `draw` uploads the instances.
      if (!live(fade)) return false;
      return ctx.snapshot.plans.get(planner, ctx).length > 0;
    },

    // The pick program derives its own frame context, which no plan row has filled, so the
    // pick gate reads the instances the last drawn frame uploaded. Invisible => unpickable.
    pickEnabled(_state, _ctx, _view, fade) {
      if (renderer.markerCount() === 0) return false;
      return live(fade);
    },

    draw(pass, view, ctx, _state, fade) {
      if (!live(fade)) return;
      // Upload THIS view's planned markers: one instance buffer is correct only because a
      // `perView` section is its own submit (`renderFrame`'s view-identity batching).
      renderer.setMarkers(ctx.snapshot.plans.get(planner, ctx), view.camPos);
      // The renderer rebases this on the eye it packed; pick reuses those instances through
      // the same rebase, so draw and pick cannot diverge.
      renderer.draw(pass, view.slab.vp, view.viewportPx, ctx.drawPxPerRad);
    },

    // One ring-pick draw per category; the renderer ORs each category's `sourceCode` into
    // the packed identity via its own @group(2).
    drawPick(pass, view, ctx, _state, fade) {
      if (!live(fade)) return;
      renderer.pickRing(pass, view.slab.vp, view.viewportPx, ctx.drawPxPerRad);
    },
  };
}
