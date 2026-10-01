/**
 * applyLinkIntent — a `LinkIntent` as the store writes a hash read has always
 * made. The pose parks BEFORE the focus requests: `watchFocusTweenSaga` reads
 * the park to stand its fly-to tween down. The commit gets its OWN object: the
 * loop detects `wireInput`'s boot commit by `base` identity, and a commit
 * aliasing the park would make that boot commit invisible to frame one.
 */
import { put } from 'typed-redux-saga';

import { requestFocus } from '../selection/requestFocus';
import { requestSelect } from '../selection/requestSelect';
import { applyUrlPose, commitCameraPose } from '../camera/cameraSlice';
import { manualPausedAtActions } from '../time/enterManualPausedAt';
import { setOrientation } from '../settings/core/orientationSlice';
import type { LinkIntent } from '../../@types/url/LinkIntent';

export function* applyLinkIntent(intent: LinkIntent) {
  const { view } = intent;
  const pose = view.kind === 'pose' || view.kind === 'focus' ? view.pose : undefined;
  if (pose !== undefined) {
    yield* put(applyUrlPose(pose));
    yield* put(commitCameraPose({ ...pose }));
  }
  if (view.kind === 'focus') {
    yield* put(requestSelect(view.id));
    yield* put(requestFocus(view.id));
  }
  if (intent.t !== undefined) {
    for (const action of manualPausedAtActions(new Date(intent.t))) yield* put(action);
  }
  if (intent.orientation !== undefined) yield* put(setOrientation(intent.orientation));
}
