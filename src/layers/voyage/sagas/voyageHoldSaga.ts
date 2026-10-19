/**
 * voyageHoldSaga — the voyage exhibit's hold: the trip launches at the instant the exhibit opens,
 * paused there, with the camera on the ship (flown to, unless the entry is a cut, while the loop
 * already listens). Run, resume, − / + or a scrub while playing play the trip in ship time. A
 * destination tab opens the sibling exhibit, a takeover swap, so it never reaches this loop. A
 * linked `t=` is ignored: the exhibit's link opens at launch (spec §4.7). The camera row is core's
 * to turn off.
 */
import { call, cancel, fork, getContext, put, race, select, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import { flyToPoseClip } from '../../../data/animation/clips/makers/flyToPoseClip';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { VOYAGE_DESTINATIONS } from '../../../data/voyage/voyageDestinations';
import { aimCamera } from '../../../state/camera/cameraSlice';
import { selectOrientation } from '../../../state/settings/selectors';
import { exitTakeover } from '../../../state/takeover/takeoverActions';
import { selectTimeState } from '../../../state/time/selectors';
import { pause, resume, setSimDays } from '../../../state/time/timeSlice';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { voyageEntryPose } from '../../../utils/voyage/voyageEntryPose';
import { playVoyage } from '../exhibits/playVoyage';
import { selectRoute } from '../state/voyage/selectors';
import { setVoyageLaunchDays, stepVoyageSpeed } from '../state/voyage/slice';
import { voyagePlaySaga } from './voyagePlaySaga';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Transition } from '../../../@types/navigation/Transition';
import type { SagaContext } from '../../../store/types';
import type { VoyageSection } from '../@types/VoyageSection';

/** A scrub is a stream of `setSimDays`; the profile is rebuilt once the drag goes quiet. */
const SCRUB_SETTLE_MS = 150;

/** Launch the trip at the clock's current instant and hold the clock there. */
function* launchNow(): Generator {
  const nowMs = performance.now();
  const days = deriveSimDays(yield* select(selectTimeState), nowMs);
  yield* put(setVoyageLaunchDays(days));
  // Pins the clock on the launch exactly (dropping a playing profile), so the ship reads τ = 0.
  yield* put(setSimDays({ simDays: days, nowMs }));
}

export function* voyageHoldSaga(
  _data: VoyageSection,
  entry: Transition,
  _atLinkedTime: boolean,
): Generator {
  let speed = (yield* select(selectRoute)).speed;
  yield* call(launchNow);
  yield* put(pause({ nowMs: performance.now() }));
  yield* put(aimCamera({ ease: false }));

  let task: Task | null = null;
  let fly: Task | null = null;
  try {
    // The exhibit's snapshot always sets the destination before this saga runs.
    const destination = (yield* select(selectRoute)).destination;
    if (entry !== 'cut' && destination !== null) {
      const basis = ORIENTATION_FRAMES[yield* select(selectOrientation)];
      fly = yield* fork(flyIn, voyageEntryPose(VOYAGE_DESTINATIONS[destination], basis));
    }
    for (;;) {
      const next = yield* race({
        exit: take(exitTakeover),
        play: take(playVoyage),
        resume: take(resume),
        speed: take(stepVoyageSpeed),
        scrub: take(setSimDays),
      });
      if (next.exit) break;
      if (next.speed) {
        // The cluster's reducer has already stepped (and clamped) the factor.
        const stepped = (yield* select(selectRoute)).speed;
        if (stepped === speed) continue;
        speed = stepped;
      }
      // Paused, a speed change or scrub only moves the factor or the clock; playing, they
      // rebuild the profile from here. Run and resume have cleared the pause flag already.
      const playing = !(yield* select(selectTimeState)).paused;
      if (task !== null) {
        yield* cancel(task);
        task = null;
      }
      // A re-aim while the fly-in still owns the camera eases from where it ends up.
      if (fly?.isRunning() ?? false) yield* put(aimCamera({ ease: true }));
      const run = next.play !== undefined || next.resume !== undefined;
      if (run || playing) {
        task = yield* fork(voyagePlaySaga, speed, {
          replayAtEnd: run,
          settleMs: next.scrub ? SCRUB_SETTLE_MS : 0,
        });
      }
    }
  } finally {
    if (task !== null) yield* cancel(task);
    if (fly !== null) yield* cancel(fly);
  }
}

function* flyIn(pose: CameraPose): Generator {
  const playClip = yield* getContext<SagaContext['playClip']>('playClip');
  yield* call(playClip, flyToPoseClip(pose), yield* select(selectOrientation));
}
