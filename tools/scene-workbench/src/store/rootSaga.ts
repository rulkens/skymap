import { all } from 'typed-redux-saga';

/** Composes every feature watcher saga — empty until task 12 adds them. */
export function* mainSaga() {
  yield* all([]);
}
