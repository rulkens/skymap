/**
 * applyLinkSettingsSaga — lands what a link says besides the view: `t` and
 * `orientation`, which everything framed after them is framed against, then
 * the `layers` switches in order. The arrival runs it before the camera
 * runtime exists, a hash change at the head of `navigateSaga`; landing the
 * same intent twice is a no-op.
 */
import { call, put } from 'typed-redux-saga';

import { applyLayerSwitchesSaga } from './applyLayerSwitchesSaga';
import { manualPausedAtActions } from '../time/enterManualPausedAt';
import { setOrientation } from '../settings/core/orientationSlice';
import { setFilmEnabled } from '../settings/core/filmSlice';
import type { LinkIntent } from '../../@types/url/LinkIntent';

export function* applyLinkSettingsSaga(intent: LinkIntent) {
  if (intent.t !== undefined) {
    for (const action of manualPausedAtActions(new Date(intent.t))) yield* put(action);
  }
  if (intent.orientation !== undefined) yield* put(setOrientation(intent.orientation));
  if (intent.film !== undefined) yield* put(setFilmEnabled(intent.film));
  if (intent.layers !== undefined) yield* call(applyLayerSwitchesSaga, intent.layers);
}
