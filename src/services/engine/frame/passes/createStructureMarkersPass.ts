/**
 * createStructureMarkersPass — shared factory behind the cosmic and Milky Way
 * marker passes: halo + ring draws into the hdr layer for one scale's structure
 * categories, plus their ring pick. The slabs differ only in which bands gate
 * the pass and which renderer handle it drives.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { StructureMarkersPassSpec } from '../../../../@types/engine/frame/StructureMarkersPassSpec';
import { anyFadeBandVisible } from '../../../../utils/math/anyFadeBandVisible';
import { STRUCTURE_VISIBLE_BANDS_BY_SCALE } from '../../presentation/structureVisibleBands';
import { structureMarkersPlanner } from '../planners/structureMarkersPlanner';

export function createStructureMarkersPass(spec: StructureMarkersPassSpec): ContentPass {
  const bands = STRUCTURE_VISIBLE_BANDS_BY_SCALE[spec.scale];
  // Past every category's visibility band all descriptors carry alpha 0 (rings and halos
  // dissolve on the descent), so the pass drops out. Keyed on distance from the render origin.
  const inBand = (cam: readonly [number, number, number]) =>
    anyFadeBandVisible(bands, Math.hypot(cam[0], cam[1], cam[2]));

  return {
    name: spec.name,

    enabled(state, ctx, _view) {
      if (spec.rendererOf(state) === null) return false;
      // Band before plan: the (hdr, NEAR0) group must empty above the foreground gate
      // from camera distance alone, without reading this frame's plans. The PLANNED list,
      // never the renderer's marker count: `draw` uploads the instances.
      if (!inBand(ctx.drawCamPos)) return false;
      return ctx.snapshot.plans.get(structureMarkersPlanner, ctx).length > 0;
    },

    // The pick program derives its own frame context, which no plan row has filled, so the
    // pick gate reads the instances the last drawn frame uploaded. Invisible ⇒ unpickable.
    pickEnabled(state, ctx, _view) {
      const renderer = spec.rendererOf(state);
      if (renderer === null || renderer.markerCount() === 0) return false;
      return inBand(ctx.drawCamPos);
    },

    draw(pass, view, ctx, state) {
      // The bands reach 0 continuously before this skip engages, so no pop.
      if (!inBand(view.camPos)) return;
      const renderer = spec.rendererOf(state)!;
      // Upload THIS view's planned markers: one instance buffer is correct only because a
      // `perView` section is its own submit (`renderFrame`'s view-identity batching).
      renderer.setMarkers(ctx.snapshot.plans.get(structureMarkersPlanner, ctx), view.camPos);
      // The renderer rebases this on the eye it packed; pick reuses those instances through
      // the same rebase, so draw and pick cannot diverge.
      renderer.draw(pass, view.slab.vp, view.viewportPx, ctx.drawPxPerRad);
    },

    // One ring-pick draw per category; the renderer ORs each category's `sourceCode` into
    // the packed identity via its own @group(2).
    drawPick(pass, view, ctx, state) {
      if (!inBand(view.camPos)) return;
      spec.rendererOf(state)!.pickRing(pass, view.slab.vp, view.viewportPx, ctx.drawPxPerRad);
    },
  };
}
