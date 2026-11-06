/**
 * applyLinkSettingsSaga — lands what a link says besides the view: `t` and
 * `orientation`, which everything framed after them is framed against, then
 * the `layers` switches in order. The arrival runs it before the camera
 * runtime exists, a hash change at the head of `navigateSaga`; landing the
 * same intent twice is a no-op.
 */
import { put, select } from 'typed-redux-saga';

import { manualPausedAtActions } from '../time/enterManualPausedAt';
import { setOrientation } from '../settings/core/orientationSlice';
import { selectSettings } from '../settings/selectSettings';
import { setVisibilityActionsFor } from '../../utils/visibility/setVisibilityActionsFor';
import type { LinkIntent } from '../../@types/url/LinkIntent';

export function* applyLinkSettingsSaga(intent: LinkIntent) {
  if (intent.t !== undefined) {
    for (const action of manualPausedAtActions(new Date(intent.t))) yield* put(action);
  }
  if (intent.orientation !== undefined) yield* put(setOrientation(intent.orientation));
  if (intent.layers === undefined) return;
  // One read serves the list: whether a cluster has a section switch is structural, and no
  // write here changes it. `overMs: 0` snaps, as a link's orientation does.
  const settings = yield* select(selectSettings);
  for (const { address, on } of intent.layers) {
    for (const action of setVisibilityActionsFor(settings, address, on, 0)) yield* put(action);
  }
}
