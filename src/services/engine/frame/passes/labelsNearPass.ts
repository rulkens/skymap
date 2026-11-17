/**
 * labelsNearPass — issues the draw call for the NEAR0 captions and their
 * leaders, which `foregroundLabelDirector` uploads earlier in `runFrame`
 * (`enabled` therefore reads THIS frame's real demand, not a stale artifact of
 * its own draw). A second renderer, not the COSMO `labelsCosmoPass`'s, because
 * one renderer draws through one slab and these anchors sit AU-to-parsec away,
 * inside COSMO's fixed 10-kpc near plane. Each aspect also serves the NEAR0 label records
 * (`shownLabelRecords`), drawn after the old director's set until that one goes.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { overlaySceneOcclusion } from '../overlaySceneOcclusion';
import { hasPickableLabel } from '../../../../utils/labels/hasPickableLabel';
import { labelPickQuads } from '../../../../utils/labels/labelPickQuads';
import { textLayoutOf } from '../../../gpu/labelLayout/textLayoutOf';
import { shownLabelRecords } from '../../labels/shownLabelRecords';
import { recordPickQuads } from '../../../../utils/labels/recordPickQuads';
import { NEAR0 } from '../slabs';

export const labelsNearPass: ContentPass = {
  name: 'labels-near',
  // Ranks a caption over the body disc it draws on — `ContentPass.pickTarget`.
  pickTarget: 'overlay',

  enabled(state, _ctx, _view) {
    return (
      state.gpu.labelRendererNear !== null &&
      (state.subsystems.foregroundLabelDirector.labels().length > 0 ||
        shownLabelRecords(state, NEAR0) !== null)
    );
  },

  // Pick gate — NARROWER than `enabled`: the constellation captions carry no
  // `pickId` (they name no selectable object), so a constellations-only frame
  // must not allocate the `pick:overlay` target for a draw that stamps nothing.
  pickEnabled(state) {
    if (state.gpu.labelRendererNear === null) return false;
    const shown = shownLabelRecords(state, NEAR0);
    return (
      hasPickableLabel(state.subsystems.foregroundLabelDirector.labels()) ||
      (shown !== null && recordPickQuads(shown.records, shown.frame).length > 0)
    );
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.labelRendererNear;
    if (renderer === null) return;
    // The joint the renderer binds: the coverage alpha AND the sampled depth
    // these captions clip their glyphs against, since their `occludeNearKm`
    // and the depth frame measure the same eye-relative km.
    const scene = overlaySceneOcclusion(ctx, view);
    if (state.subsystems.foregroundLabelDirector.labels().length > 0) {
      renderer.draw(pass, state.subsystems.foregroundLabelDirector.project(ctx), scene);
    }
    const shown = shownLabelRecords(state, NEAR0);
    if (shown !== null) renderer.drawRecords(pass, shown.view, scene);
  },

  // Pick aspect — grace-padded ink boxes for the drawn captions, stamped with
  // the SAME packed id the body's own sphere/glint pick writes, so a caption
  // click and a body click resolve to one selection. Uses
  // `near0LabelProjection` (the projection the captions are drawn
  // through), not `view.vp` — the caption anchors are camera-relative.
  // `bodyGlintsPass.drawPick` widens its own pick to this caption range for
  // the same affordance.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.labelPickRendererNear;
    const fontAtlases = state.gpu.fontAtlases;
    if (pickRenderer === null || fontAtlases === null) return;

    const projection = state.subsystems.foregroundLabelDirector.project(ctx);
    const quads = labelPickQuads({
      labels: state.subsystems.foregroundLabelDirector.labels(),
      projection,
      measure: (label) => textLayoutOf(fontAtlases.metricsByFont, label).bbox,
    });
    const shown = shownLabelRecords(state, NEAR0);
    if (shown !== null) quads.push(...recordPickQuads(shown.records, shown.frame));
    pickRenderer.draw(pass, quads, view.window);
  },
};
