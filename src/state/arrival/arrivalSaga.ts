/**
 * arrivalSaga — owns the first view. It takes the boot read's intent, cuts to
 * its subject, and reveals once a frame has drawn it; a subject that cannot be
 * reached in `ARRIVAL_TIMEOUT_MS`, or that names nothing, lands home instead
 * and the arrival reports why. `ready` and the veil read only the outcome.
 */
import { call, delay, put, race, take } from 'typed-redux-saga';

import { arrivalPending, arrived, arrivalFailed } from './arrivalSlice';
import { navigateSaga } from '../navigation/navigateSaga';
import { afterTwoFrames } from '../../services/animation/afterTwoFrames';
import { ARRIVAL_TIMEOUT_MS } from '../../data/arrival/arrivalTimeoutMs';
import type { ArrivalState } from '../../@types/state/arrival/ArrivalState';
import type { LinkIntent } from '../../@types/url/LinkIntent';

const HOME: LinkIntent = { view: { kind: 'home' } };

export function* arrivalSaga() {
  const { payload: intent } = yield* take(arrivalPending);
  const { done } = yield* race({
    done: call(navigateSaga, intent, 'cut' as const),
    timeout: delay(ARRIVAL_TIMEOUT_MS),
  });
  const failure: ArrivalState['reason'] =
    done === undefined ? 'timeout' : done.ok ? undefined : done.reason;
  if (failure !== undefined) yield* call(navigateSaga, HOME, 'cut' as const);
  yield* call(afterTwoFrames);
  yield* put(failure === undefined ? arrived() : arrivalFailed(failure));
}
