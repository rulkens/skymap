/**
 * applyLinkClockAndFrameSaga — lands a link's `t` and `orientation`, which
 * everything framed after them is framed against. The arrival runs it before
 * the camera runtime exists, a hash change at the head of `navigateSaga`.
 */
import { put } from 'typed-redux-saga';

import { manualPausedAtActions } from '../time/enterManualPausedAt';
import { setOrientation } from '../settings/core/orientationSlice';
import type { LinkIntent } from '../../@types/url/LinkIntent';

export function* applyLinkClockAndFrameSaga(intent: LinkIntent) {
  if (intent.t !== undefined) {
    for (const action of manualPausedAtActions(new Date(intent.t))) yield* put(action);
  }
  if (intent.orientation !== undefined) yield* put(setOrientation(intent.orientation));
}
