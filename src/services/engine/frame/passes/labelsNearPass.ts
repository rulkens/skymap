/**
 * labelsNearPass — draws the NEAR0 label director's records (`shownLabelRecords`), which
 * `runLabelDirector` uploads earlier in `runFrame`, so `enabled` reads this frame's demand.
 * A second renderer, not `labelsCosmoPass`'s: one renderer holds one director's upload.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { overlaySceneOcclusion } from '../overlaySceneOcclusion';
import { shownLabelRecords } from '../../labels/shownLabelRecords';
import { recordPickQuads } from '../../../../utils/labels/recordPickQuads';
import { hasClickableRecord } from '../../../../utils/labels/hasClickableRecord';
import { NEAR0 } from '../slabs';

export const labelsNearPass: ContentPass = {
  name: 'labels-near',
  // Ranks a caption over the body disc it draws on — `ContentPass.pickTarget`.
  pickTarget: 'overlay',

  enabled(state, _ctx, _view) {
    return state.gpu.labelRendererNear !== null && shownLabelRecords(state, NEAR0) !== null;
  },

  // Pick gate — NARROWER than `enabled`: a frame whose records carry no pick word (the
  // constellation names) must not allocate the `pick:overlay` target for a draw that stamps nothing.
  pickEnabled(state) {
    if (state.gpu.labelRendererNear === null) return false;
    const shown = shownLabelRecords(state, NEAR0);
    return shown !== null && hasClickableRecord(shown.records, shown.frame);
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.labelRendererNear;
    const shown = shownLabelRecords(state, NEAR0);
    if (renderer === null || shown === null) return;
    // The joint the renderer binds: the coverage alpha AND the sampled depth the captions
    // clip their glyphs against.
    renderer.draw(pass, shown.view, overlaySceneOcclusion(ctx, view));
  },

  // Grace-padded ink boxes stamped with the SAME packed id the body's own sphere/glint pick
  // writes, so a caption click and a body click resolve to one selection.
  drawPick(pass, view, _ctx, state) {
    const pickRenderer = state.gpu.labelPickRendererNear;
    const shown = shownLabelRecords(state, NEAR0);
    if (pickRenderer === null || shown === null) return;
    pickRenderer.draw(
      pass,
      recordPickQuads(shown.records, shown.frame, shown.view.projection.pxScale),
      view.window,
    );
  },
};
