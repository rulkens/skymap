import { all } from 'typed-redux-saga';

import { watchGroupSaga } from '../state/group/watchGroupSaga';
import { watchRegistrySaga } from '../state/registry/watchRegistrySaga';
import { watchSplatSortSaga } from '../state/splat/watchSplatSortSaga';

/** Composes every feature watcher saga — the transform watcher arrives with
 *  plans 3–4. */
export function* mainSaga() {
  yield* all([watchRegistrySaga(), watchGroupSaga(), watchSplatSortSaga()]);
}
