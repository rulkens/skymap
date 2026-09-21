/**
 * viewBody — a view's takeover body: apply its settings, fly to its pose,
 * then hold, turning slowly, until the viewer exits. `runTakeover` owns the
 * snapshot/start/restore/end bracket; this only decides when the body
 * returns. `exitTakeover` is the only abort arm — a view has no beat loop,
 * so orbiting mid-fly or mid-hold must not end it.
 */
import { call, getContext, put, race, select, take } from 'typed-redux-saga';

import { flyToPoseClip } from '../scene/flyToPoseClip';
import { clearSelection } from '../selection/selectionSlice';
import { mergeSnapshot } from '../settings/mergeSnapshotAction';
import { setAutoRotate } from '../camera/cameraSlice';
import { exitTakeover } from '../takeover/takeoverActions';
import { selectOrientation } from '../settings/selectors';
import type { RootState } from '../../store/types';
import type { View } from '../../@types/views/View';
import type { SagaContext } from '../../store/types';

/**
 * The held view's yaw drift, in radians per assumed-60-fps frame
 * (`spinAutoRotate`'s unit) — about 1 deg/s, a full turn in six minutes. Far
 * slower than the slice default (0.000873, ~3 deg/s), which is authored for a
 * viewer who asked for a spin; here it is ambient, meant to be noticed only
 * after a few seconds of looking.
 */
const VIEW_SPIN_RATE = 0.0003;

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

  // The drift is `camera.autoRotate`, not a looping clip: it spins from the
  // frozen `base` the clip just committed, so it needs no duration guessed in
  // advance and cannot drift out of step with a hold of unknown length.
  // `camera` is NOT in `runTakeover`'s scene snapshot (that covers settings,
  // orientation and focus), so the restore is this body's own — in a `finally`,
  // which a generator runs on cancellation too, so a supersede winds it back
  // as surely as an exit does.
  const priorSpin = yield* select((s: RootState) => s.camera.autoRotate);
  yield* put(setAutoRotate({ active: true, rate: VIEW_SPIN_RATE }));
  try {
    yield* take(exitTakeover);
  } finally {
    yield* put(setAutoRotate(priorSpin));
  }
}
