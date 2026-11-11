/**
 * studioBodySaga — the studio takeover's body: load the studio chunk and run its session for the
 * clip until `exitTakeover`, the way clip, tour and exhibit bodies end. The dynamic import is one of
 * the two places the app reaches `packages/studio` (`studioImportBoundary`), so Vite emits the
 * package as a lazy chunk. The studio writes no scene in slice 1, so there is no scene snapshot.
 */
import { call, race, take } from 'typed-redux-saga';

import { exitTakeover } from '../takeover/takeoverActions';
import type { ClipId } from '../../@types/animation/ClipId';

export function* studioBodySaga(id: ClipId): Generator {
  yield* race({
    run: call(function* () {
      // A chunk that will not load (offline, a stale deploy) must end this body, not throw into
      // `watchTakeoverSaga`: its death would stop every app saga.
      try {
        const { studioSessionSaga } = yield* call(
          () => import('../../../packages/studio/src/studioEntry'),
        );
        yield* call(studioSessionSaga, id);
      } catch (error) {
        console.error('studio: could not load the studio chunk', error);
      }
    }),
    exit: take(exitTakeover),
  });
}
