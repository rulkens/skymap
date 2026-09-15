/**
 * watchFadesSaga — every settings write re-syncs every fade row.
 *
 * Task 4's `targetOf` skip in `applyIntent` is what makes this affordable: a
 * row whose intent didn't change costs one `targetOf` lookup, not a fade
 * restart, so no per-action FADE_ROW lookup is needed to narrow the sync.
 *
 * The engine is reached via getContext so the store layer keeps no engine imports.
 */

import { takeEvery, getContext } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { settingsRoute } from '../constants';
import type { ReconcileEffects } from './ReconcileEffects';

const isSettingsWrite = (a: Action): boolean =>
  typeof a.type === 'string' && a.type.startsWith(`${settingsRoute}/`);

export function* watchFadesSaga() {
  yield* takeEvery(isSettingsWrite, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.syncFades();
  });
}
