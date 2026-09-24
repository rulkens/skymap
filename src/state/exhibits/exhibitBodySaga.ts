/**
 * exhibitBodySaga — an exhibit's takeover body: apply its settings, fly to its
 * pose, then hold, turning slowly, until the viewer exits. `runTakeoverSaga` owns
 * the snapshot/start/restore/end bracket; this only decides when the body
 * returns. `exitTakeover` is the only abort arm — an exhibit has no beat loop,
 * so orbiting mid-fly or mid-hold must not end it.
 */
import { call, getContext, put, race, select, take } from 'typed-redux-saga';

import { flyToPoseClip } from '../../data/animation/clips/makers/flyToPoseClip';
import { clearSelection } from '../selection/selectionSlice';
import { mergeSnapshot } from '../settings/mergeSnapshotAction';
import { setAutoRotate } from '../camera/cameraSlice';
import { exitTakeover } from '../takeover/takeoverActions';
import { selectOrientation } from '../settings/selectors';
import { sphereFitDistance } from '../../utils/camera/sphereFitDistance';
import type { RootState } from '../../store/types';
import type { Exhibit } from '../../@types/exhibits/Exhibit';
import type { SagaContext } from '../../store/types';

/**
 * The held exhibit's yaw drift, in radians per assumed-60-fps frame
 * (`spinAutoRotate`'s unit) — about 1 deg/s, a full turn in six minutes. Far
 * slower than the slice default (0.000873, ~3 deg/s), which is authored for a
 * viewer who asked for a spin; here it is ambient, meant to be noticed only
 * after a few seconds of looking. NEGATIVE so the drift continues the
 * direction the fly-in's pivot slide was already travelling, instead of
 * reversing it the moment the camera lands.
 */
const EXHIBIT_SPIN_RATE = -0.0003;

export function* exhibitBodySaga(exhibit: Exhibit): Generator {
  // Clear the focus slot BEFORE the fly, exactly as `tourBodySaga` does. The boot
  // home seeds Earth into it (`EARTH_HOME`), and Earth is a body the sim clock
  // moves — so `followApproach`@55 is live the whole time and outranks
  // `resting`@0. The clip@95 driver hides that while it plays; the frame it
  // ends on, follow wins and eases the camera off the exhibit's pose toward
  // Earth's framing. `runTakeoverSaga`'s snapshot holds the viewer's focus for the
  // exit restore, and an exhibit authors no focus of its own.
  yield* put(clearSelection());
  yield* put(mergeSnapshot(exhibit.settings));

  const playClip = yield* getContext<SagaContext['playClip']>('playClip');
  const orientation = yield* select(selectOrientation);

  // `fitRadiusMpc` re-derives `pose.distance` against the LIVE lens + aspect,
  // not the authored fallback — a static distance can't fit a sphere at every
  // viewport shape (see `sphereFitDistance`). No wait: pre-bootstrap the
  // runtime is null and the authored `pose.distance` flies instead, same as
  // any other exhibit.
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  const rt = cameraRuntime();
  const pose =
    exhibit.fitRadiusMpc !== undefined && rt !== null
      ? {
          ...exhibit.pose,
          distance: sphereFitDistance(exhibit.fitRadiusMpc, rt.fovYRad, rt.aspect),
        }
      : exhibit.pose;

  const { exit } = yield* race({
    landed: call(playClip, flyToPoseClip(pose), orientation),
    exit: take(exitTakeover),
  });
  if (exit) return;

  // The drift is `camera.autoRotate`, not a looping clip: it spins from the
  // frozen `base` the clip just committed, so it needs no duration guessed in
  // advance and cannot drift out of step with a hold of unknown length.
  // `camera` is NOT in `runTakeoverSaga`'s scene snapshot (that covers settings,
  // orientation and focus), so the restore is this body's own — in a `finally`,
  // which a generator runs on cancellation too, so a supersede winds it back
  // as surely as an exit does.
  const priorSpin = yield* select((s: RootState) => s.camera.autoRotate);
  yield* put(setAutoRotate({ active: true, rate: EXHIBIT_SPIN_RATE }));
  try {
    yield* take(exitTakeover);
  } finally {
    yield* put(setAutoRotate(priorSpin));
  }
}
