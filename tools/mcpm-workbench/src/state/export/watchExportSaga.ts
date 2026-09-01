/**
 * watchExportSaga — the two download buttons' actual work: `readbackTrace`
 * off the running harness, then `exportNpy`+`emitTraceSidecar` or `exportScfd`,
 * each via `triggerDownload`. `takeLeading`, not `takeEvery`: a readback is
 * one in-flight GPU round trip per leg, and a repeat click mid-copy should be
 * ignored rather than queued (Viewport's old code had no queuing either —
 * `void runExport()` fire-and-forget from a click handler). No-op without a
 * harness — same guard style as `watchSimCommandsSaga`.
 */
import { takeLeading, call, put, select, getContext } from 'typed-redux-saga';

import type { WorkbenchSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import { downloadStem } from '../../export/downloadStem';
import { emitTraceSidecar } from '../../export/emitTraceSidecar';
import { exportNpy } from '../../export/exportNpy';
import { exportScfd } from '../../export/exportScfd';
import { triggerDownload } from '../../export/triggerDownload';
import { widenTrace } from '../../export/widenTrace';
import { exportNpyRequested, exportScfdRequested } from '../commands';
import { setCatalogStatusMessage } from '../slices/catalogSlice';

function* exportNpyWorker() {
  const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
  const harness = resources?.harness;
  const weights = resources?.weights;
  const s = yield* select((state: RootState) => state);
  const { points } = s.catalog;
  if (!harness || !points || !weights) return; // mirrors Viewport's old runExport guard
  try {
    const readback = yield* call(() => harness.readbackTrace());
    const stem = downloadStem(new Date());
    triggerDownload(`${stem}.npy`, exportNpy(readback), 'application/octet-stream');
    const sidecar = emitTraceSidecar({
      box: harness.box,
      points,
      weights,
      tier: s.catalog.tier,
      params: s.sim.params,
      agentCount: s.sim.agentCount,
      steps: s.sim.stepCount,
      seed: s.sim.seed,
      producedAt: new Date(),
    });
    triggerDownload(`${stem}.json`, sidecar, 'application/json');
  } catch (err) {
    console.error('mcpm-workbench: export failed', err);
    yield* put(setCatalogStatusMessage(`export failed: ${(err as Error).message}`));
  }
}

function* exportScfdWorker() {
  const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
  const harness = resources?.harness;
  if (!harness) return;
  try {
    const readback = yield* call(() => harness.readbackTrace());
    const values = widenTrace(readback);
    const scfd = exportScfd(values, harness.box);
    const stem = downloadStem(new Date());
    triggerDownload(`${stem}.scfd`, scfd, 'application/octet-stream');
  } catch (err) {
    console.error('mcpm-workbench: scfd export failed', err);
    yield* put(setCatalogStatusMessage(`scfd export failed: ${(err as Error).message}`));
  }
}

export function* watchExportSaga() {
  yield* takeLeading(exportNpyRequested, exportNpyWorker);
  yield* takeLeading(exportScfdRequested, exportScfdWorker);
}
