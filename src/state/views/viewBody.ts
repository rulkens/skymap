/**
 * viewBody — a view's takeover body: apply its settings, fly to its pose,
 * then hold until the viewer exits. `runTakeover` owns the
 * snapshot/start/restore/end bracket; this only decides when the body
 * returns. `exitTakeover` is the only abort arm — a view has no beat loop,
 * so orbiting mid-fly or mid-hold must not end it.
 */
import { call, getContext, put, race, select, take } from 'typed-redux-saga';

import { flyToPoseClip } from '../scene/flyToPoseClip';
import { clearSelection } from '../selection/selectionSlice';
import { mergeSnapshot } from '../settings/mergeSnapshotAction';
import { exitTakeover } from '../takeover/takeoverActions';
import { selectOrientation } from '../settings/selectors';
import type { View } from '../../@types/views/View';
import type { SagaContext } from '../../store/types';

export function* viewBody(view: View): Generator {
  // Clear the focus slot BEFORE the fly, exactly as `tourBody` does. The boot
  // home seeds Earth into it (`EARTH_HOME`), and Earth is a body the sim clock
  // moves — so `followApproach`@55 is live the whole time and outranks
  // `resting`@0. The clip@95 driver hides that while it plays; the frame it
  // ends on, follow wins and eases the camera off the view's pose toward
  // Earth's framing. `runTakeover`'s snapshot holds the viewer's focus for the
  // exit restore, and a view authors no focus of its own.
  yield* put(clearSelection());
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
