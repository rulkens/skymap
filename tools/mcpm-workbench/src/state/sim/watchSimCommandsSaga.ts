/**
 * watchSimCommandsSaga — reset and clear-trace, the workbench's two one-shot
 * commands (`commands.ts`). Both call `graph.resetVolpath()` directly:
 * `volpathKeyFor` no longer folds either command into its key (Task 2), so
 * nothing else would notice the path-tracer accumulator needs wiping.
 * No-op without a harness — mirrors Viewport's old token-watcher guard.
 */
import { takeEvery, put, select, getContext } from 'typed-redux-saga';

import type { WorkbenchSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import { clearTraceRequested, resetRequested } from '../commands';
import { setCatalogStatusMessage } from '../slices/catalogSlice';
import { resetHistogram } from '../slices/histogramSlice';
import { resetStepCount } from '../slices/simSlice';
import {
  defaultViewSlice,
  setAutoRotate,
  setCameraDistance,
  setCameraTarget,
  setCameraYawPitch,
} from '../slices/viewSlice';

function* resetWorker() {
  const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
  if (!resources?.harness) return;
  try {
    const { initMode, seed } = yield* select((s: RootState) => s.sim);
    resources.harness.reset(initMode, seed);
    yield* put(resetStepCount());
    yield* put(resetHistogram());
    resources.graph?.resetVolpath();
    // Reset restores framing too, deliberately: the orbit target is absolute world
    // Mpc, not box-relative, so nothing else recenters the camera onto the box —
    // this is the one recovery path for "camera drifted" (Viewport's old comment).
    // Four dispatches, not a whole-object write: RTK has no single "replace this
    // nested object" action, and none of these camera fields are among
    // watchSceneSaga's SCENE_REBUILD_TRIGGERS, so the split has no rebuild side effect.
    const { camera } = defaultViewSlice;
    yield* put(setCameraYawPitch({ yaw: camera.yaw, pitch: camera.pitch }));
    yield* put(setCameraDistance(camera.distance));
    yield* put(setCameraTarget(camera.targetMpc));
    yield* put(setAutoRotate(camera.autoRotate));
  } catch (err) {
    console.error('mcpm-workbench: reset failed', err);
    yield* put(setCatalogStatusMessage(`reset failed: ${(err as Error).message}`));
  }
}

function* clearTraceWorker() {
  const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
  if (!resources?.harness) return;
  try {
    resources.harness.clearTrace();
    resources.graph?.resetVolpath();
  } catch (err) {
    console.error('mcpm-workbench: clear trace failed', err);
    yield* put(setCatalogStatusMessage(`clear trace failed: ${(err as Error).message}`));
  }
}

export function* watchSimCommandsSaga() {
  yield* takeEvery(resetRequested, resetWorker);
  yield* takeEvery(clearTraceRequested, clearTraceWorker);
}
