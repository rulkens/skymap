/**
 * watchPaletteSaga — re-attaches the trace/volpath pass whenever its palette
 * setter fires (the LUT bakes into the pass's bind group at construction;
 * see ViewSlice.d.ts). Moved out of Viewport's `frame()` closure (T11):
 * `takeEvery` on the setter IS the edge now, replacing the old per-frame
 * `attachedRaymarchPalette`/`attachedVolpathPalette` diff. Each worker is
 * synchronous up to its guard below (no `call`/async step), so it can't
 * crash or leave a dangling graph reference against a concurrent
 * `watchSceneSaga` build, and the preview-dispose seam (below) is unaffected.
 * Known pre-existing edge, not fixed here: a palette dispatch landing during
 * a build's async window can be silently dropped — see the guard's comment.
 */
import { takeEvery, put, getContext } from 'typed-redux-saga';

import type { WorkbenchSagaContext } from '../../store/sagaContext';
import {
  setPathTracerPaletteId,
  setPreviewPacked,
  setRaymarchPaletteId,
} from '../slices/viewSlice';

export function* watchPaletteSaga() {
  yield* takeEvery(setRaymarchPaletteId, function* (action) {
    const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
    const h = resources?.harness;
    const graph = resources?.graph;
    // Known edge (pre-existing, tracked by the controller — not fixed here):
    // watchSceneSaga's buildScene reads view.*PaletteId ONCE, before its own
    // async gaps, and never re-selects before its attachTrace/attachVolpath.
    // A dispatch landing while resources.harness/graph is still null (mid-
    // build) no-ops here AND the build then attaches its stale pre-dispatch
    // snapshot — the change is silently dropped until the next palette
    // change or rebuild.
    if (!resources || !h || !graph) return;
    graph.attachTrace({
      traceBuffer: h.traceBuffer,
      box: h.box,
      element: h.element,
      paletteId: action.payload,
    });
    // Re-attaching invalidates a packed preview baked from the old palette —
    // `watchPreviewPackedSaga`'s falling edge is the one owner of the actual
    // dispose, this only flips the toggle.
    if (graph.hasPreviewTrace()) yield* put(setPreviewPacked(false));
  });

  yield* takeEvery(setPathTracerPaletteId, function* (action) {
    const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
    const h = resources?.harness;
    const graph = resources?.graph;
    if (!resources || !h || !graph) return;
    graph.attachVolpath({
      traceBuffer: h.traceBuffer,
      box: h.box,
      element: h.element,
      paletteId: action.payload,
    });
  });
}
