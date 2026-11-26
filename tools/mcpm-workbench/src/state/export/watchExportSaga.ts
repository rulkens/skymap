/**
 * watchExportSaga — the two download buttons' actual work: `readbackTrace`
 * off the running harness, then `exportNpy`+`emitTraceSidecar` or `exportScfd`,
 * each via `triggerDownload`. `takeLeading`: a repeat click mid-readback is
 * ignored, not queued. The sidecar describes `resources.built`, not the store.
 * Epoch snapshot before `readbackTrace()`, compared after: a rebuild landing
 * mid-readback disposes the buffers the export would otherwise read from.
 */
import { takeLeading, call, put, select, getContext } from 'typed-redux-saga';

import type { WorkbenchSagaContext } from '../../../@types/store/WorkbenchSagaContext';
import type { RootState } from '../../store/types';
import { downloadStem } from '../../export/downloadStem';
import { emitTraceSidecar } from '../../export/emitTraceSidecar';
import { exportNpy } from '../../export/exportNpy';
import { exportScfd } from '../../export/exportScfd';
import { triggerDownload } from '../../export/triggerDownload';
import { widenTrace } from '../../export/widenTrace';
import { exportNpyRequested, exportScfdRequested } from '../commands';
import { setCatalogStatusMessage } from '../catalog/catalogSlice';

function* exportNpyWorker() {
  const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
  const harness = resources?.harness;
  const built = resources?.built;
  if (!harness || !built) return;
  const s = yield* select((state: RootState) => state);
  const epoch = resources.epoch;
  try {
    const readback = yield* call(() => harness.readbackTrace());
    if (resources.epoch !== epoch) {
      yield* put(setCatalogStatusMessage('export superseded by a scene rebuild'));
      return;
    }
    const stem = downloadStem(new Date());
    triggerDownload(`${stem}.npy`, exportNpy(readback), 'application/octet-stream');
    const sidecar = emitTraceSidecar({
      box: harness.box,
      points: built.points,
      weights: built.weights,
      tier: built.tier,
      params: s.sim.params,
      agentCount: built.agentCount,
      steps: s.sim.stepCount,
      seed: s.sim.seed,
      producedAt: new Date(),
      userFile: built.userFile,
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
  const epoch = resources.epoch;
  try {
    const readback = yield* call(() => harness.readbackTrace());
    if (resources.epoch !== epoch) {
      yield* put(setCatalogStatusMessage('export superseded by a scene rebuild'));
      return;
    }
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
