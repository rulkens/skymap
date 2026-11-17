/**
 * labelsCosmoPass — draws the COSMO label director's records (`shownLabelRecords`), which
 * `runLabelDirector` uploads earlier in `runFrame`, so `enabled` reads this frame's demand.
 * A swap-target layer, not an hdr one (`passes/index.ts` says why): the text writes straight
 * into the tone-mapped swap chain, premultiplied OVER, as UI overlay rather than emissive
 * content. Placed after `selectionRingPass` so text composites over the ring.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { overlaySceneOcclusion } from '../overlaySceneOcclusion';
import { shownLabelRecords } from '../../labels/shownLabelRecords';
import { recordPickQuads } from '../../../../utils/labels/recordPickQuads';
import { COSMO } from '../slabs';

export const labelsCosmoPass: ContentPass = {
  name: 'labels-cosmo',

  enabled(state, _ctx, _view) {
    return state.gpu.labelRendererCosmo !== null && shownLabelRecords(state, COSMO) !== null;
  },

  // Pick gate — NARROWER than `enabled`: a frame of pure decoration (no record carries a
  // pick word) must not pull an r32uint pick target into existence for a draw that stamps nothing.
  pickEnabled(state, _ctx) {
    if (state.gpu.labelRendererCosmo === null) return false;
    const shown = shownLabelRecords(state, COSMO);
    return shown !== null && recordPickQuads(shown.records, shown.frame).length > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.labelRendererCosmo;
    const shown = shownLabelRecords(state, COSMO);
    if (renderer === null || shown === null) return;
    renderer.draw(pass, shown.view, overlaySceneOcclusion(ctx, view));
  },

  // Grace-padded ink boxes stamped with each subject's packed id (`recordPickQuads`). Scene
  // occlusion is deliberately NOT reproduced: an occluded label stays clickable, the safe
  // direction for a click affordance.
  drawPick(pass, view, _ctx, state) {
    const pickRenderer = state.gpu.labelPickRendererCosmo;
    const shown = shownLabelRecords(state, COSMO);
    if (pickRenderer === null || shown === null) return;
    pickRenderer.draw(pass, recordPickQuads(shown.records, shown.frame), view.window);
  },
};
