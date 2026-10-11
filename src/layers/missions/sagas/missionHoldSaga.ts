/**
 * missionHoldSaga — a timeline exhibit's hold: the clock opens paused at the selected craft's
 * launch (or a linked `t=`) with the mission camera on it (flown to, unless the entry is a cut,
 * while the loop already listens). Run, resume, a flyby step and − / + or a scrub while playing
 * play the mission profile; a step or craft tab re-aims the camera, easing to the new frame
 * (keeping the visitor's orbit), a tab lifting the clock to that craft's launch (or carrying it
 * there from any listed craft's launch). The camera row is core's to turn off on exit.
 */
import { call, cancel, fork, getContext, put, race, select, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import { flyToPoseClip } from '../../../data/animation/clips/makers/flyToPoseClip';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { missionCameraFrame } from '../../../utils/camera/missionCameraFrame';
import { bodyPositionMpcAt } from '../../../utils/exhibits/mission/bodyPositionMpcAt';
import { missionStops } from '../../../utils/exhibits/mission/missionStops';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import { timelineEndMs } from '../../../utils/exhibits/timeline/timelineEndMs';
import { aimCamera } from '../../../state/camera/cameraSlice';
import { selectOrientation } from '../../../state/settings/selectors';
import { selectMissionCraft, selectMissionSpeed } from '../state/missions/selectors';
import { setMissionCraft, stepMissionSpeed } from '../state/missions/slice';
import { exitTakeover } from '../../../state/takeover/takeoverActions';
import { selectTimeState } from '../../../state/time/selectors';
import { pause, resume, setSimDays, stepToEvent } from '../../../state/time/timeSlice';
import { missionPlaySaga } from './missionPlaySaga';
import { playMission } from '../exhibits/timeline/playMission';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { MissionCourse } from '../../../@types/missions/MissionCourse';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';
import type { MissionTimeline } from '../../../@types/exhibits/MissionTimeline';
import type { Transition } from '../../../@types/navigation/Transition';
import type { SagaContext } from '../../../store/types';

/** A scrub is a stream of `setSimDays`; the profile is rebuilt once the drag goes quiet. */
const SCRUB_SETTLE_MS = 150;

/** A clock this close to a launch counts as at it (a minute, under any float drift). */
const LAUNCH_TOLERANCE_DAYS = 1 / 1440;

const launchDays = (mission: MissionCourse): number => unixMsToJulianDays(mission.stops[0]!.ms);

export function* missionHoldSaga(
  _exhibit: Exhibit,
  timeline: MissionTimeline,
  entry: Transition,
  atLinkedTime: boolean,
): Generator {
  const missionOf = (craftId: string): MissionCourse => ({
    craftId,
    stops: missionStops(timeline.events.filter((e) => e.bodyId === craftId)),
    cruise: timeline.cruise,
  });
  let speed = yield* select(selectMissionSpeed);
  // The exhibit's snapshot always sets the craft before this saga runs.
  let mission = missionOf((yield* select(selectMissionCraft))!);
  const nowMs = performance.now();
  // A linked `t=` is already on the clock; it wins over the launch, kept inside the mission.
  const entryDays = atLinkedTime
    ? Math.min(
        unixMsToJulianDays(timelineEndMs(timeline)),
        Math.max(launchDays(mission), deriveSimDays(yield* select(selectTimeState), nowMs)),
      )
    : launchDays(mission);
  yield* put(setSimDays({ simDays: entryDays, nowMs }));
  yield* put(pause({ nowMs }));
  yield* put(aimCamera({ ease: false }));

  let task: Task | null = null;
  let fly: Task | null = null;
  try {
    if (entry !== 'cut') {
      const pose = yield* entryPose(mission, entryDays);
      if (pose !== null) fly = yield* fork(flyIn, pose);
    }
    for (;;) {
      const next = yield* race({
        exit: take(exitTakeover),
        step: take(stepToEvent),
        tab: take(setMissionCraft),
        play: take(playMission),
        resume: take(resume),
        speed: take(stepMissionSpeed),
        scrub: take(setSimDays),
      });
      if (next.exit) break;
      if (next.speed) {
        // The cluster's reducer has already stepped (and clamped) the factor.
        const stepped = yield* select(selectMissionSpeed);
        if (stepped === speed) continue;
        speed = stepped;
      }
      // Paused, a speed change or scrub only moves the factor or the clock; playing, they
      // rebuild the profile from here. Step, run and resume have set the pause flag already.
      const playing = !(yield* select(selectTimeState)).paused;
      if (task !== null) {
        yield* cancel(task);
        task = null;
      }
      const flying = fly?.isRunning() ?? false;
      if (next.tab) {
        const at = performance.now();
        const days = deriveSimDays(yield* select(selectTimeState), at);
        // At any listed craft's launch, this one's: each tab then opens on Earth.
        const atLaunch = timeline.crafts.some(
          (c) => Math.abs(days - launchDays(missionOf(c.bodyId))) < LAUNCH_TOLERANCE_DAYS,
        );
        mission = missionOf(next.tab.payload!);
        if (atLaunch || days < launchDays(mission)) {
          yield* put(setSimDays({ simDays: launchDays(mission), nowMs: at }));
        }
      }
      // A re-aim while the fly-in still owns the camera eases from where it ends up.
      if (next.step || next.tab || flying) yield* put(aimCamera({ ease: true }));
      const event = next.step
        ? timeline.events.find((e) => e.id === next.step!.payload.eventId)
        : undefined;
      const run = next.play !== undefined || next.resume !== undefined;
      if (run || event?.kind === 'flyby' || playing) {
        task = yield* fork(missionPlaySaga, mission, speed, {
          replayAtEnd: run,
          settleMs: next.scrub ? SCRUB_SETTLE_MS : 0,
          endMs: timelineEndMs(timeline),
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

/** The mission camera's zero-offset pose at `days`, for the fly in; null pre-bootstrap. */
function* entryPose(mission: MissionCourse, days: number): Generator<unknown, CameraPose | null> {
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  const rt = cameraRuntime();
  if (rt === null) return null;
  const basis = ORIENTATION_FRAMES[yield* select(selectOrientation)];
  const frame = missionCameraFrame(
    mission,
    days,
    (id) => bodyPositionMpcAt(id, days),
    rt.fovYRad,
    rt.aspect,
    basis,
    null,
  );
  if (frame === null) return null;
  return {
    target: frame.aim,
    ...orbitAnglesLookingAlong(frame.viewDirection, basis),
    distance: frame.distance,
  };
}
