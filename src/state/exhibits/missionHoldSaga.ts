/**
 * missionHoldSaga — a timeline exhibit's hold: the clock opens paused at the selected craft's
 * launch (or a linked `t=`) with the mission camera on it (flown to, unless the entry is a cut,
 * while the loop already listens). Run, resume, a flyby step and − / + or a scrub while playing
 * play the mission profile; a step or craft tab eases the camera to the new frame (keeping the
 * visitor's orbit), a tab lifting the clock to that craft's launch. `finally` clears the mission.
 */
import { call, cancel, fork, getContext, put, race, select, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import { flyToPoseClip } from '../../data/animation/clips/makers/flyToPoseClip';
import { MISSION_SPEEDS } from '../../data/exhibits/mission/missionSpeeds';
import { NO_MISSION_OFFSETS } from '../../data/exhibits/mission/noMissionOffsets';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { orbitAnglesLookingAlong } from '../../utils/camera/orbitAnglesLookingAlong';
import { missionCameraFrame } from '../../utils/camera/missionCameraFrame';
import { bodyPositionMpcAt } from '../../utils/exhibits/mission/bodyPositionMpcAt';
import { missionStops } from '../../utils/exhibits/mission/missionStops';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import { clearMission, setMission, setMissionSpeed } from '../camera/cameraSlice';
import { selectOrientation } from '../settings/selectors';
import { selectMissionEmphasis } from '../settings/core/orbitTrails/selectors';
import { setMissionEmphasis } from '../settings/core/orbitTrails/slice';
import { exitTakeover } from '../takeover/takeoverActions';
import { selectTimeState } from '../time/selectors';
import { pause, resume, setSimDays } from '../time/timeSlice';
import { missionPlaySaga } from './missionPlaySaga';
import { playMission } from './playMission';
import { stepMissionSpeed } from './stepMissionSpeed';
import { stepToMissionEvent } from './stepToMissionEvent';
import type { CameraMission } from '../../@types/camera/CameraMission';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Exhibit } from '../../@types/exhibits/Exhibit';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';
import type { Transition } from '../../@types/navigation/Transition';
import type { RootState, SagaContext } from '../../store/types';

/** A scrub is a stream of `setSimDays`; the profile is rebuilt once the drag goes quiet. */
const SCRUB_SETTLE_MS = 150;

const launchDays = (mission: CameraMission): number => unixMsToJulianDays(mission.stops[0]!.ms);

export function* missionHoldSaga(
  exhibit: Exhibit,
  timeline: ExhibitTimelineSection,
  entry: Transition,
  atLinkedTime: boolean,
): Generator {
  let speedIndex = MISSION_SPEEDS.indexOf(1);
  let retarget = 0;
  const missionOf = (craftId: string | null, offsets = NO_MISSION_OFFSETS): CameraMission => {
    const id = craftId ?? timeline.crafts[0]!.bodyId;
    return {
      craftId: id,
      stops: missionStops(timeline.events.filter((e) => e.bodyId === id)),
      cruise: { yaw: exhibit.pose.yaw, pitch: exhibit.pose.pitch },
      offsets,
      speedIndex,
      retarget,
    };
  };
  let mission = missionOf(yield* select(selectMissionEmphasis));
  const nowMs = performance.now();
  // A linked `t=` is already on the clock; it wins over the launch, kept inside the mission.
  const entryDays = atLinkedTime
    ? Math.min(
        unixMsToJulianDays(Date.now()),
        Math.max(launchDays(mission), deriveSimDays(yield* select(selectTimeState), nowMs)),
      )
    : launchDays(mission);
  yield* put(setSimDays({ simDays: entryDays, nowMs }));
  yield* put(pause({ nowMs }));
  yield* put(setMission(mission));

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
        step: take(stepToMissionEvent),
        tab: take(setMissionEmphasis),
        play: take(playMission),
        resume: take(resume),
        speed: take(stepMissionSpeed),
        scrub: take(setSimDays),
      });
      if (next.exit) break;
      if (next.speed) {
        const index = Math.min(
          MISSION_SPEEDS.length - 1,
          Math.max(0, speedIndex + next.speed.payload.step),
        );
        if (index === speedIndex) continue;
        speedIndex = index;
        yield* put(setMissionSpeed(index));
      }
      // Paused, a speed change or scrub only moves the factor or the clock; playing, they
      // rebuild the profile from here. Step, run and resume have set the pause flag already.
      const playing = !(yield* select(selectTimeState)).paused;
      if (task !== null) {
        yield* cancel(task);
        task = null;
      }
      const flying = fly?.isRunning() ?? false;
      const offsets = yield* select((s: RootState) => s.camera.mission?.offsets);
      if (next.tab) {
        mission = missionOf(next.tab.payload, offsets);
        const at = performance.now();
        if (deriveSimDays(yield* select(selectTimeState), at) < launchDays(mission)) {
          yield* put(setSimDays({ simDays: launchDays(mission), nowMs: at }));
        }
      }
      // A re-aim while the fly-in still owns the camera eases from where it ends up.
      if (next.step || next.tab || flying) {
        retarget += 1;
        mission = missionOf(mission.craftId, offsets);
        yield* put(setMission(mission));
      }
      const event = next.step
        ? timeline.events.find((e) => e.id === next.step!.payload.eventId)
        : undefined;
      const run = next.play !== undefined || next.resume !== undefined;
      if (run || event?.kind === 'flyby' || playing) {
        task = yield* fork(missionPlaySaga, mission, speedIndex, {
          replayAtEnd: run,
          settleMs: next.scrub ? SCRUB_SETTLE_MS : 0,
        });
      }
    }
  } finally {
    if (task !== null) yield* cancel(task);
    if (fly !== null) yield* cancel(fly);
    yield* put(clearMission());
  }
}

function* flyIn(pose: CameraPose): Generator {
  const playClip = yield* getContext<SagaContext['playClip']>('playClip');
  yield* call(playClip, flyToPoseClip(pose), yield* select(selectOrientation));
}

/** The mission camera's zero-offset pose at `days`, for the fly in; null pre-bootstrap. */
function* entryPose(mission: CameraMission, days: number): Generator<unknown, CameraPose | null> {
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
    ...orbitAnglesLookingAlong(frame.normal, basis),
    distance: frame.distance,
  };
}
