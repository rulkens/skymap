/**
 * liveCameraRuntimeSaga — returns the camera runtime, waiting for `wireInput`
 * to bring it up. A camera commit before `wireInput`'s boot base would be
 * overwritten by it, and the arrival's backstop must not run while the engine
 * is still booting.
 */
import { getContext, take } from 'typed-redux-saga';

import type { SagaContext } from '../../store/types';

export function* liveCameraRuntimeSaga() {
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  let runtime = cameraRuntime();
  while (runtime === null) {
    // Any action: `wireInput`'s boot commit is the first one after the
    // runtime exists, and nothing else announces it.
    yield* take('*');
    runtime = cameraRuntime();
  }
  return runtime;
}
