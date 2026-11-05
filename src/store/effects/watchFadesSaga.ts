/**
 * watchFadesSaga — every settings write recomputes every visibility target.
 *
 * The engine is reached via getContext so the store layer keeps no engine imports.
 */

import { takeEvery, getContext } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { settingsRoute } from '../constants';
import { setVisibility } from '../../state/settings/setVisibilityAction';
import type { ReconcileEffects } from './ReconcileEffects';

const isSettingsWrite = (a: Action): boolean =>
  typeof a.type === 'string' && a.type.startsWith(`${settingsRoute}/`);

export function* watchFadesSaga() {
  yield* takeEvery(isSettingsWrite, function* (action: Action) {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    // A cue's duration travels with its write: this sync runs inside the cue's `dispatch`,
    // so it is the one that starts the ramp, and nothing after it may restart it.
    if (setVisibility.match(action)) fx.syncFades({ overMs: action.payload.overMs });
    else fx.syncFades();
  });
}
