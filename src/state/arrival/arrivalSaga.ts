/**
 * arrivalSaga — owns the first view. It takes the boot read's intent, cuts to
 * its subject, and reveals once a frame has drawn it; a subject that cannot be
 * reached in `ARRIVAL_TIMEOUT_MS`, or that names nothing, lands home instead
 * and the arrival reports why. `ready` and the veil read only the outcome.
 */
import { call, delay, put, race, take } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { arrivalPending, arrived, arrivalFailed } from './arrivalSlice';
import { navigateSaga } from '../navigation/navigateSaga';
import { liveCameraRuntimeSaga } from '../navigation/liveCameraRuntimeSaga';
import { clearSelection } from '../selection/selectionSlice';
import { engineStatusChanged } from '../engine/engineSlice';
import { goLiveNowAction } from '../time/goLiveNowAction';
import { afterTwoFrames } from '../../services/animation/afterTwoFrames';
import { ARRIVAL_TIMEOUT_MS } from '../../data/arrival/arrivalTimeoutMs';
import type { ArrivalState } from '../../@types/state/arrival/ArrivalState';
import type { LinkIntent } from '../../@types/url/LinkIntent';

const HOME: LinkIntent = { view: { kind: 'home' } };

const isEngineError = (action: Action): boolean =>
  engineStatusChanged.match(action) && action.payload.kind === 'error';

export function* arrivalSaga() {
  const { payload: intent } = yield* take(arrivalPending);
  // The store boots on the J2000 seed anchor; anything framed against it
  // faces the wrong sun.
  if (intent.t === undefined) yield* put(goLiveNowAction());
  // The backstop measures reaching the subject, not booting the engine.
  const { error } = yield* race({
    runtime: call(liveCameraRuntimeSaga),
    error: take(isEngineError),
  });
  if (error !== undefined) {
    yield* put(arrivalFailed('engine-error'));
    return;
  }
  const { done } = yield* race({
    done: call(navigateSaga, intent, 'cut' as const),
    timeout: delay(ARRIVAL_TIMEOUT_MS),
  });
  const failure: ArrivalState['reason'] =
    done === undefined ? 'timeout' : done.ok ? undefined : done.reason;
  if (failure !== undefined) {
    // Retires the link's pending requests, so a catalog landing later cannot
    // pull the view off home.
    yield* put(clearSelection());
    yield* call(navigateSaga, HOME, 'cut' as const);
  }
  yield* call(afterTwoFrames);
  yield* put(failure === undefined ? arrived() : arrivalFailed(failure));
}
