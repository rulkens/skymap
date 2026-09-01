/**
 * watchPreviewPackedSaga — T18's preview-export view (readback → widenTrace →
 * `previewPackedTrace` → `graph.attachPreviewTrace`), moved out of Viewport's
 * own subscriber. `takeLatest(setPreviewPacked, …)` replaces the old
 * boolean-edge diffing: rising edge (`payload: true`) packs, falling edge
 * disposes — one worker, branching on the payload, so every falling-edge
 * caller (an explicit uncheck, a pack failure, Viewport's own palette
 * re-attach) shares the same disposal path.
 *
 * Unlike `watchSceneSaga`'s `buildScene`, no `acceptBuiltHarness`-style
 * cancellation guard is needed: the worker's only await (`readbackTrace`) is
 * a self-cleaning promise — its own try/finally destroys the MAP_READ
 * staging buffer regardless of whether the result is ever consumed — and
 * every later step that allocates something needing disposal
 * (`previewPackedTrace`'s GPU buffer, `attachPreviewTrace`) runs
 * SYNCHRONOUSLY after that one `yield*`. A `takeLatest` cancellation unwinds
 * before the generator resumes, so those lines simply never run for a
 * superseded worker rather than running and leaking.
 *
 * A second watcher disposes on `incrementStep` once `stepCount` moves past
 * the packed snapshot (`isPreviewStale`) — the sim steps up to 60x/s while
 * running, so it bails on one cheap `select` whenever nothing is packed.
 */
import { takeLatest, takeEvery, call, put, select, getContext } from 'typed-redux-saga';

import { previewPackedTrace } from '../../export/previewPackedTrace';
import { widenTrace } from '../../export/widenTrace';
import type { RenderResources } from '../../render/renderResources';
import type { WorkbenchSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import { incrementStep } from '../slices/simSlice';
import { setPreviewPacked, setPreviewPackedAtStep } from '../slices/viewSlice';
import { isPreviewStale } from './isPreviewStale';

function disposePreview(resources: RenderResources): void {
  resources.graph?.disposePreviewTrace();
  resources.previewBuffer?.destroy();
  resources.previewBuffer = null;
}

export function* watchPreviewPackedSaga() {
  yield* takeLatest(setPreviewPacked, function* (action) {
    const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
    if (!resources) return;
    if (!action.payload) {
      disposePreview(resources);
      yield* put(setPreviewPackedAtStep(null));
      return;
    }
    const h = resources.harness;
    const graph = resources.graph;
    if (!h || !graph) return;
    try {
      const readback = yield* call(() => h.readbackTrace());
      // A scene rebuild (watchSceneSaga) can land mid-readback since nothing
      // cancels this worker except another `setPreviewPacked` dispatch —
      // `resources.harness` would already point at the new build (or null).
      if (resources.harness !== h) return;
      const values = widenTrace(readback);
      disposePreview(resources);
      const paletteId = yield* select((s: RootState) => s.view.raymarch.paletteId);
      const packed = previewPackedTrace(h.gpu.device, values, h.box);
      resources.previewBuffer = packed.buffer;
      graph.attachPreviewTrace({
        traceBuffer: packed.buffer,
        box: h.box,
        element: packed.element,
        paletteId,
      });
      const stepCount = yield* select((s: RootState) => s.sim.stepCount);
      yield* put(setPreviewPackedAtStep(stepCount));
    } catch (err) {
      console.error('mcpm-workbench: preview packed trace failed', err);
      disposePreview(resources);
      yield* put(setPreviewPacked(false));
    }
  });

  yield* takeEvery(incrementStep, function* () {
    const packedAtStep = yield* select((s: RootState) => s.view.raymarch.previewPackedAtStep);
    if (packedAtStep === null) return;
    const stepCount = yield* select((s: RootState) => s.sim.stepCount);
    if (!isPreviewStale(packedAtStep, stepCount)) return;
    const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
    if (!resources) return;
    disposePreview(resources);
    yield* put(setPreviewPacked(false));
    yield* put(setPreviewPackedAtStep(null));
  });
}
