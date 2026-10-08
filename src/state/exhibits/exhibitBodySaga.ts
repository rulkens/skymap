/**
 * exhibitBodySaga — an exhibit's takeover body: apply its settings, fly (or,
 * on a `'cut'` entry, cut) to its pose, then hold, turning slowly, until the
 * viewer exits. `runTakeoverSaga` and `withSceneSnapshotSaga` own the bracket;
 * this only decides when the body returns. `exitTakeover` is the only abort
 * arm — an exhibit has no beat loop, so orbiting mid-fly or mid-hold must not
 * end it. The hold is a loop over timeline steps: a flyby step rides along, a step away from
 * a ride, `showWholeMission` or a craft-tab switch ends it and flies back to the pose.
 */
import { call, cancel, fork, getContext, put, race, select, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import { flyToPoseClip } from '../../data/animation/clips/makers/flyToPoseClip';
import { clearSelection } from '../selection/selectionSlice';
import { mergeSnapshot } from '../settings/mergeSnapshotAction';
import { clearRide, commitCameraPose, setAutoRotate } from '../camera/cameraSlice';
import { rideSaga } from './rideSaga';
import { showWholeMission } from './showWholeMission';
import { stepToMissionEvent } from './stepToMissionEvent';
import { setMissionEmphasis } from '../settings/core/orbitTrails/slice';
import { exitTakeover } from '../takeover/takeoverActions';
import { selectOrientation } from '../settings/selectors';
import { exhibitPose } from '../../utils/exhibits/exhibitPose';
import { absoluteArm } from '../../utils/camera/absoluteArm';
import type { RootState } from '../../store/types';
import type { Exhibit } from '../../@types/exhibits/Exhibit';
import type { SagaContext } from '../../store/types';
import type { Transition } from '../../@types/navigation/Transition';

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

export function* exhibitBodySaga(exhibit: Exhibit, entry: Transition): Generator {
  // Clear the focus slot BEFORE the fly, exactly as `tourBodySaga` does. The boot
  // home seeds Earth into it (`EARTH_HOME`), and Earth is a body the sim clock
  // moves — so `followApproach`@55 is live the whole time and outranks
  // `resting`@0. The clip@95 driver hides that while it plays; the frame it
  // ends on, follow wins and eases the camera off the exhibit's pose toward
  // Earth's framing. `withSceneSnapshotSaga`'s snapshot holds the viewer's focus for the
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
  const pose = exhibitPose(exhibit, rt);

  if (entry === 'cut') {
    yield* put(commitCameraPose(absoluteArm(pose)));
  } else {
    const { exit } = yield* race({
      landed: call(playClip, flyToPoseClip(pose), orientation),
      exit: take(exitTakeover),
    });
    if (exit) return;
  }

  // The drift is `camera.autoRotate`, not a looping clip: it spins from the
  // frozen `base` the fly or the cut committed, so it needs no duration guessed in
  // advance and cannot drift out of step with a hold of unknown length.
  // `camera` is NOT in `withSceneSnapshotSaga`'s scene snapshot (that covers settings,
  // orientation and focus), so the restore is this body's own — in a `finally`,
  // which a generator runs on cancellation too, so a supersede winds it back
  // as surely as an exit does.
  const priorSpin = yield* select((s: RootState) => s.camera.autoRotate);
  if (exhibit.drift !== false) yield* put(setAutoRotate({ active: true, rate: EXHIBIT_SPIN_RATE }));
  const events = exhibit.body.flatMap((section) =>
    section.kind === 'timeline' ? section.events : [],
  );
  let task: Task | null = null;
  try {
    for (;;) {
      const next = yield* race({
        exit: take(exitTakeover),
        step: take(stepToMissionEvent),
        whole: take(showWholeMission),
        tab: take(setMissionEmphasis),
      });
      if (next.exit) break;
      const riding = yield* select((s: RootState) => s.camera.ride !== null);
      if (task !== null) yield* cancel(task);
      task = null;
      const event = next.step ? events.find((e) => e.id === next.step!.payload.eventId) : undefined;
      if (event?.kind === 'flyby') {
        task = yield* fork(rideSaga, event);
      } else if (riding) {
        // Only a ride is undone: a visitor who orbited the whole-mission view keeps their framing.
        yield* put(clearRide());
        task = yield* fork(function* () {
          yield* call(playClip, flyToPoseClip(exhibitPose(exhibit, cameraRuntime())), orientation);
        });
      }
    }
  } finally {
    // An exhibit exit restores no camera pose, so the ride must not outlive the takeover.
    if (task !== null) yield* cancel(task);
    yield* put(clearRide());
    yield* put(setAutoRotate(priorSpin));
  }
}
