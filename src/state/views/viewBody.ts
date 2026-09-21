/**
 * viewBody — a view's takeover body: apply its settings, fly to its pose
 * racing `exitTakeover` the whole time, then hold until the viewer exits
 * (spec §7.2). `runTakeover` owns the snapshot/start/restore/end bracket;
 * this only decides when the body returns.
 *
 * The fly races `exitTakeover` — mirroring `tourBody`'s outer race
 * (`tourBody.ts:85-95`) — so an Exit press during the fly-in cancels the
 * in-flight `playClip` call immediately instead of queuing behind a `take`
 * that isn't listening yet. `exitTakeover` is the only abort arm: a view has
 * no beat loop to race navigation against, so orbiting mid-fly or mid-hold
 * must leave it running.
 */
import { call, getContext, put, race, select, take } from 'typed-redux-saga';

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

  const { exit } = yield* race({
    landed: call(playClip, flyToPoseClip(view.pose), orientation),
    exit: take(exitTakeover),
  });
  if (exit) return;

  yield* take(exitTakeover);
}
