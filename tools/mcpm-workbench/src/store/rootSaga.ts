/**
 * rootSaga — composes every feature watcher saga, mirroring `src/store/rootSaga.ts`.
 * Empty for now: the workbench's Viewport-owned closures move into sagas in
 * later tasks (T7-T12 of the mcpm-workbench-sagas plan), not this one.
 */
import { all } from 'typed-redux-saga';

export function* mainSaga() {
  yield* all([]);
}
