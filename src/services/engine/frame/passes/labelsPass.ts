/**
 * labelsPass — draws one label director's records (`shownLabelRecords`), which
 * `runLabelDirector` uploads earlier in `runFrame`, so `enabled` reads this frame's demand.
 * A swap-target layer, not an hdr one (`passes/index.ts` says why): the text writes straight
 * into the tone-mapped swap chain, premultiplied OVER, as UI overlay rather than emissive
 * content.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { LabelsPassRow } from '../../../../@types/engine/frame/LabelsPassRow';
import { overlaySceneOcclusion } from '../overlaySceneOcclusion';
import { shownLabelRecords } from '../../labels/shownLabelRecords';
import { recordPickQuads } from '../../../../utils/labels/recordPickQuads';
import { hasClickableRecord } from '../../../../utils/labels/hasClickableRecord';

export function labelsPass(row: LabelsPassRow): ContentPass {
  return {
    name: row.name,
    pickTarget: row.pickTarget,

    enabled(state, _ctx, _view) {
      return state.gpu[row.renderer] !== null && shownLabelRecords(state, row.slab) !== null;
    },

    // Pick gate — NARROWER than `enabled`: a frame whose records carry no pick word (the
    // constellation names) must not allocate a pick target for a draw that stamps nothing.
    pickEnabled(state) {
      if (state.gpu[row.renderer] === null) return false;
      const shown = shownLabelRecords(state, row.slab);
      return shown !== null && hasClickableRecord(shown.records, shown.frame);
    },

    draw(pass, view, ctx, state) {
      const renderer = state.gpu[row.renderer];
      const shown = shownLabelRecords(state, row.slab);
      if (renderer === null || shown === null) return;
      // The joint the renderer binds: the coverage alpha AND the sampled depth the captions
      // clip their glyphs against.
      renderer.draw(pass, shown.view, overlaySceneOcclusion(ctx, view));
    },

    // Grace-padded ink boxes stamped with the SAME packed id the subject's own geometry pick
    // writes, so a label click and a subject click resolve to one selection. Scene occlusion
    // is deliberately NOT reproduced: an occluded label stays clickable, the safe direction.
    drawPick(pass, view, _ctx, state) {
      const pickRenderer = state.gpu[row.pickRenderer];
      const shown = shownLabelRecords(state, row.slab);
      if (pickRenderer === null || shown === null) return;
      pickRenderer.draw(
        pass,
        recordPickQuads(shown.records, shown.frame, shown.view.projection.pxScale),
        view.window,
      );
    },
  };
}
