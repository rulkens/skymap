/**
 * watchLogCameraStateSaga — handles the reducer-less `logCameraState` command by
 * calling the engine's pose-printing effect, then logs a share URL from what it
 * returns: the current hash body with `t` overridden from the RENDERED frame's
 * sim instant (not the clock anchor, so a live clock still yields a
 * reproducible link) and `pose` added. getContext is read PER ACTION, inside
 * the worker — not once at fork — because the engine registers its saga context
 * AFTER the root saga forks (the same reason watchGoHomeSaga reads cameraRuntime
 * lazily).
 */
import { takeEvery, getContext, select } from 'typed-redux-saga';

import { logCameraState } from './logCameraState';
import { hashBodyFor } from '../url/hashBodyFor';
import { parseHashParams } from '../../utils/url/parseHashParams';
import { composeHashParams } from '../../utils/url/composeHashParams';
import { encodeFramedPose } from '../../utils/url/encodeFramedPose';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';
import type { RootState } from '../../store/types';

export function* watchLogCameraStateSaga() {
  yield* takeEvery(logCameraState, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    const dump = fx.logCameraState();
    if (dump === null) return;

    const state = yield* select((s: RootState) => s);
    const params = new Map(parseHashParams(hashBodyFor(state)));
    params.set('t', new Date(julianDaysToUnixMs(dump.simDays)).toISOString());
    params.set('pose', encodeFramedPose(dump.framed));

    if (typeof location === 'undefined') return;
    console.log(
      '[engine] share URL:',
      `${location.origin}${location.pathname}#${composeHashParams(params)}`,
    );
  });
}
