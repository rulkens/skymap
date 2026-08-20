/**
 * watchFadesSaga — settings write → fade. Per-leaf writes route through FADE_ROW,
 * so adding a fade-triggering layer is one `writes` entry in VISIBILITY_ACTION_ROW
 * and this saga never changes. The `mergeSnapshot` arm re-fades every row, which
 * is why a tour scene-restore needs NO restore-specific engine effect —
 * `restoreSceneSaga` just puts the snapshot.
 *
 * The engine is reached via getContext so the store layer keeps no engine imports.
 */

import { takeEvery, getContext } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { mergeSnapshot } from '../../state/settings/settingsSlice';
import { FADE_ROW } from '../../services/animation/visibilityActionRow';
import type { ReconcileEffects } from './ReconcileEffects';

export function* watchFadesSaga() {
  yield* takeEvery(
    (a: Action) => a.type in FADE_ROW,
    function* (action: Action) {
      const fx = yield* getContext<ReconcileEffects>('reconcile');
      fx.syncFades([FADE_ROW[action.type]!]);
    },
  );

  yield* takeEvery(mergeSnapshot, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.syncFades();
  });
}
