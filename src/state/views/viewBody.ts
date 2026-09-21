/**
 * viewBody — a view's takeover body: apply its settings, fly to its pose,
 * then hold until the viewer exits. `runTakeover` owns the
 * snapshot/start/restore/end bracket; this only decides when the body
 * returns. `exitTakeover` is the only abort arm — a view has no beat loop,
 * so orbiting mid-fly or mid-hold must not end it.
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
