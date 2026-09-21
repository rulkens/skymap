/**
 * viewBody — a view's takeover body: apply its settings, fly to its pose, then
 * hold until the viewer exits (spec §7.2). `runTakeover` owns the
 * snapshot/start/restore/end bracket; this does only those three things, in
 * order, and dispatches nothing else.
 *
 * `exitTakeover` is the only abort arm — mirroring `tourBody`'s reasoning
 * (see its module header): a view has no beat loop to race navigation
 * against, so orbiting mid-view must leave it running. The `take` below is
 * plain, not raced against a camera-input action.
 */
import { call, getContext, put, select, take } from 'typed-redux-saga';

import { flyToPoseClip } from '../scene/flyToPoseClip';
import { mergeSnapshot } from '../settings/mergeSnapshotAction';
import { exitTakeover } from '../takeover/takeoverActions';
import { selectOrientation } from '../settings/selectors';
import type { View } from '../../@types/views/View';
import type { SagaContext } from '../../store/types';

export function* viewBody(view: View): Generator {
  yield* put(mergeSnapshot(view.settings));

  const playClip = yield* getContext<SagaContext['playClip']>('playClip');
  const orientation = yield* select(selectOrientation);
  yield* call(playClip, flyToPoseClip(view.pose), orientation);

  yield* take(exitTakeover);
}
