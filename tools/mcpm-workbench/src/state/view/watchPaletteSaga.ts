/**
 * watchPaletteSaga — re-attaches the trace/volpath pass whenever its palette
 * setter fires (the LUT bakes into the pass's bind group at construction;
 * see ViewSlice.d.ts). Moved out of Viewport's `frame()` closure (T11):
 * `takeEvery` on the setter IS the edge now, replacing the old per-frame
 * `attachedRaymarchPalette`/`attachedVolpathPalette` diff. Both workers run
 * to completion synchronously (no `call`/async step), so a dispatch can't
 * land mid-worker — see watchSceneSaga's build-vs-reattach race in the task
 * report for why that also keeps this safe against a concurrent scene build.
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
