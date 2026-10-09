/**
 * missionHoldSaga — a timeline exhibit's hold: the clock opens paused at the selected craft's
 * launch with the mission camera on it (flown to, unless the entry is a cut), then a loop over
 * the visitor's intents. A flyby step, run and − / + play the mission profile; any step resets
 * the orbit offsets; a craft tab re-aims the camera, lifting the clock to that craft's launch.
 * `finally` clears the mission, so the camera driver cannot outlive the takeover.
 */
import { call, cancel, fork, getContext, put, race, select, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import { flyToPoseClip } from '../../data/animation/clips/makers/flyToPoseClip';
import { MISSION_SPEEDS } from '../../data/exhibits/mission/missionSpeeds';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { orbitAnglesLookingAlong } from '../../utils/camera/orbitAnglesLookingAlong';
import { missionCameraFrame } from '../../utils/camera/missionCameraFrame';
import { bodyPositionMpcAt } from '../../utils/exhibits/mission/bodyPositionMpcAt';
import { missionStops } from '../../utils/exhibits/mission/missionStops';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import { clearMission, setMission } from '../camera/cameraSlice';
import { selectOrientation } from '../settings/selectors';
import { selectMissionEmphasis } from '../settings/core/orbitTrails/selectors';
import { setMissionEmphasis } from '../settings/core/orbitTrails/slice';
import { exitTakeover } from '../takeover/takeoverActions';
import { selectTimeState } from '../time/selectors';
import { pause, setSimDays } from '../time/timeSlice';
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

const launchDays = (mission: CameraMission): number => unixMsToJulianDays(mission.stops[0]!.ms);

export function* missionHoldSaga(
  exhibit: Exhibit,
  timeline: ExhibitTimelineSection,
  entry: Transition,
): Generator {
  const missionOf = (craftId: string | null): CameraMission => {
    const id = craftId ?? timeline.crafts[0]!.bodyId;
    return {
      craftId: id,
      stops: missionStops(timeline.events.filter((e) => e.bodyId === id)),
      cruise: { yaw: exhibit.pose.yaw, pitch: exhibit.pose.pitch },
      offsets: { yaw: 0, pitch: 0, zoom: 1 },
    };
  };
  let mission = missionOf(yield* select(selectMissionEmphasis));
  const nowMs = performance.now();
  yield* put(setSimDays({ simDays: launchDays(mission), nowMs }));
  yield* put(pause({ nowMs }));
  yield* put(setMission(mission));

  let speedIndex = MISSION_SPEEDS.indexOf(1);
  let task: Task | null = null;
  try {
    if (entry !== 'cut') {
      const pose = yield* launchPose(mission);
      if (pose !== null) {
        const playClip = yield* getContext<SagaContext['playClip']>('playClip');
        const { exit } = yield* race({
          landed: call(playClip, flyToPoseClip(pose), yield* select(selectOrientation)),
          exit: take(exitTakeover),
        });
        if (exit) return;
      }
    }
    for (;;) {
      const next = yield* race({
        exit: take(exitTakeover),
        step: take(stepToMissionEvent),
        tab: take(setMissionEmphasis),
        play: take(playMission),
        speed: take(stepMissionSpeed),
      });
      if (next.exit) break;
      const wasPlaying = yield* select((s: RootState) => s.time.profile !== null);
      if (task !== null) {
        yield* cancel(task);
        task = null;
      }
      if (next.speed) {
        speedIndex = Math.min(
          MISSION_SPEEDS.length - 1,
          Math.max(0, speedIndex + next.speed.payload.step),
        );
      }
      if (next.tab) {
        mission = missionOf(next.tab.payload);
        const at = performance.now();
        if (deriveSimDays(yield* select(selectTimeState), at) < launchDays(mission)) {
          yield* put(setSimDays({ simDays: launchDays(mission), nowMs: at }));
        }
      }
      // A fresh mission record is also the offsets reset.
      if (next.step || next.tab) yield* put(setMission(mission));
      const event = next.step
        ? timeline.events.find((e) => e.id === next.step!.payload.eventId)
        : undefined;
      if (next.play || next.speed || event?.kind === 'flyby' || (next.tab && wasPlaying)) {
        task = yield* fork(missionPlaySaga, mission, speedIndex);
      }
    }
  } finally {
    if (task !== null) yield* cancel(task);
    yield* put(clearMission());
  }
}

/** The mission camera's zero-offset pose at the craft's launch, for the fly in; null pre-bootstrap. */
function* launchPose(mission: CameraMission): Generator<unknown, CameraPose | null> {
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  const rt = cameraRuntime();
  if (rt === null) return null;
  const basis = ORIENTATION_FRAMES[yield* select(selectOrientation)];
  const days = launchDays(mission);
  const frame = missionCameraFrame(
    mission,
    days,
    (id) => bodyPositionMpcAt(id, days),
    rt.fovYRad,
    rt.aspect,
    basis,
  );
  if (frame === null) return null;
  return {
    target: frame.aim,
    ...orbitAnglesLookingAlong(frame.normal, basis),
    distance: frame.distance,
  };
}
