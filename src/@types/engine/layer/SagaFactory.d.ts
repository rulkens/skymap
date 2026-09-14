import type { SagaGenerator } from 'typed-redux-saga';

/** A watcher saga exactly as `rootSaga` forks it: called with no arguments, dropped into `all([…])`. */
export type SagaFactory = () => SagaGenerator<void>;
