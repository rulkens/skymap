/**
 * foregroundLabelsLayer — issues the draw calls for the NEAR0 caption + leader
 * -line renderers `foregroundLabelDirector` uploads earlier in `runFrame`
 * (`enabled` therefore reads THIS frame's real demand, not a stale artifact of
 * its own draw). A second renderer pair, not the COSMO `labelsLayer`'s pair,
 * because one renderer draws with one view-projection and these anchors sit
 * AU-to-parsec away, inside COSMO's fixed 10-kpc near plane.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { near0LabelProjection } from '../near0LabelProjection';
import { hasPickableLabel, labelPickQuads } from './labelPickQuads';

export const foregroundLabelsLayer: ContentLayer = {
  name: 'foreground-labels',
  slab: NEAR0,
  target: 'swap',
  blend: 'over',

  enabled(state) {
    const renderer = state.gpu.foregroundLabelRenderer;
    return renderer !== null && renderer.glyphCount() > 0;
  },

  // Pick gate — NARROWER than `enabled`: the constellation captions carry no
  // `pickId` (they name no selectable object), so a constellations-only frame
  // must not allocate the `pick:near0` target for a draw that stamps nothing.
  pickEnabled(state) {
    const renderer = state.gpu.foregroundLabelRenderer;
    if (renderer === null || renderer.glyphCount() === 0) return false;
    return hasPickableLabel(renderer.packedLabels());
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.foregroundLabelRenderer;
    if (renderer === null) return;
    const lineRenderer = state.gpu.foregroundMarkerLineRenderer;

    const { vpF32, viewportPx } = near0LabelProjection(ctx);

    // Valid only when the body pass ran this frame — else `foreground:0`'s
    // depth is stale/uninitialised and would discard every caption.
    const depthView = ctx.renderedTargets.has('foreground:0')
      ? ctx.renderTargets.depthViewOf('foreground:0')
      : undefined;

    // Lines before captions, so the glyphs composite OVER the connector where
    // they meet. A null line renderer (bootstrap gap) just skips them.
    if (lineRenderer !== null) {
      lineRenderer.draw(pass, vpF32, viewportPx, depthView);
    }
    renderer.draw(pass, vpF32, viewportPx, depthView);
  },

  // Pick aspect — the drawn captions' grace-padded ink boxes, each stamped
  // with the SAME packed id the body's own sphere / glint pick writes, so a
  // caption click and a body click resolve to one selection. The rects ride
  // `near0LabelProjection` (the f64-rebased vp the captions are drawn through,
  // NOT `view.vp`) because the caption anchors are camera-relative.
  //
  // This is what makes a sub-pixel body's NAME the click target its glint
  // footprint could only approximate — see `bodyGlintsLayer.drawPick`, which
  // widens its own pick to the caption range for exactly that affordance.
  drawPick(pass, _view, ctx, state) {
    const renderer = state.gpu.foregroundLabelRenderer;
    const pickRenderer = state.gpu.foregroundLabelPickRenderer;
    if (renderer === null || pickRenderer === null) return;

    const projection = near0LabelProjection(ctx);
    const quads = labelPickQuads({
      labels: renderer.packedLabels(),
      projection,
      measure: (label) => renderer.measure(label),
    });
    pickRenderer.draw(pass, quads, projection.viewportPx);
  },
};
