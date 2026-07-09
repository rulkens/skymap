/**
 * clipPathDebugLayer — draws the clip-path inspector overlay (the precomputed
 * speed-coloured eye route + the scrub-instant camera gizmo).
 *
 * Lives in `UI_PASSES`, drawn post-tone-map onto the swap chain via the shared
 * `uiOverlay` render pass — same family as `markerLinesLayer`, but fed by the
 * dedicated `debugLineRenderer` (no label-director coupling). The geometry is
 * NOT in Redux: the snapshot is held by the `clipPathInspector` subsystem
 * (precomputed once on the debug panel's "Calculate"), and only the scalar
 * `scrubT` rides on `state.settings.debug.clipPathInspect`. Each frame this
 * layer rebuilds the `DebugLine[]` from (snapshot, scrubT, view) and uploads
 * it wholesale — cheap for a few hundred lines, and keeps the overlay live to
 * scrubbing without any per-frame compute.
 *
 * ### When it draws
 *
 *   1. `state.gpu.debugLineRenderer` is non-null (built in `initGpu`).
 *   2. `subsystems.clipPathInspector.current()` is non-null — the user has
 *      clicked "Calculate" and a snapshot is held. "Clear" drops it and this
 *      layer goes quiet.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { buildClipPathLines } from '../../presentation/buildClipPathLines';

export const clipPathDebugLayer: ContentLayer = {
  name: 'clip-path-debug',
  slab: COSMO,
  target: 'swap',
  blend: 'over',

  enabled(state, _ctx) {
    if (state.gpu.debugLineRenderer === null) return false;
    return state.subsystems.clipPathInspector.current() !== null;
  },

  draw(pass, view, ctx, state) {
    // `enabled()` proved both are non-null; the framework only calls draw then.
    const snapshot = state.subsystems.clipPathInspector.current()!;
    const aspect = view.viewportPx[0] / view.viewportPx[1];
    const lines = buildClipPathLines(snapshot, state.settings.debug.clipPathInspect.scrub01, {
      fovYRad: ctx.fovYRad,
      aspect,
    });
    const renderer = state.gpu.debugLineRenderer!;
    renderer.setLines(lines);
    renderer.draw(pass, view.vp, view.viewportPx);
  },
};
