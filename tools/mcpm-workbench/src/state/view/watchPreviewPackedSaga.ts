/**
 * watchPreviewPackedSaga — packs (readback → widenTrace → previewPackedTrace
 * → attachPreviewTrace) on `setPreviewPacked`'s rising edge via `takeLatest`,
 * disposes on the falling edge; a second watcher disposes on `incrementStep`
 * once `stepCount` passes the packed snapshot. No aborted-flag guard needed:
 * `readbackTrace`'s own try/finally destroys its staging buffer regardless of
 * consumption, and every disposal-needing allocation runs synchronously
 * after that one `yield*` — a cancelled worker never reaches it. An epoch
 * snapshot still guards against a rebuild landing mid-readback (see below).
 */
import { takeLatest, takeEvery, call, put, select, getContext } from 'typed-redux-saga';

import { previewPackedTrace } from '../../export/previewPackedTrace';
import { widenTrace } from '../../export/widenTrace';
import type { RenderResources } from '../../render/renderResources';
import type { WorkbenchSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import { incrementStep } from '../sim/simSlice';
import { setPreviewPacked, setPreviewPackedAtStep } from './viewSlice';
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
    const epoch = resources.epoch;
    try {
      const readback = yield* call(() => h.readbackTrace());
      // A scene rebuild (watchSceneSaga) can land mid-readback since nothing
      // cancels this worker except another `setPreviewPacked` dispatch.
      if (resources.epoch !== epoch) return;
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
