import { beforeAll, describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { CameraMission } from '../../../../src/@types/camera/CameraMission';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { FollowMemory } from '../../../../src/@types/engine/camera/FollowMemory';
import type { DriverId } from '../../../../src/@types/engine/camera/DriverId';
import type { MissionEvent } from '../../../../src/@types/missions/MissionEvent';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { MISSION_EASE_MS } from '../../../../src/data/exhibits/mission/missionEaseMs';
import { MISSION_FLYBY_LEAD_DAYS } from '../../../../src/data/exhibits/mission/missionFlybyLeadDays';
import { MISSION_SPEEDS } from '../../../../src/data/exhibits/mission/missionSpeeds';
import { buildMissionProfile } from '../../../../src/utils/exhibits/mission/buildMissionProfile';
import { interpolateMissionProfile } from '../../../../src/utils/time/interpolateMissionProfile';
import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { missionPose } from '../../../../src/services/engine/camera/missionPose';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { setMission } from '../../../../src/state/camera/cameraSlice';
import { rootReducer } from '../../../../src/store/rootReducer';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { flybyNormal } from '../../../../src/utils/exhibits/mission/flybyNormal';
import { missionStops } from '../../../../src/utils/exhibits/mission/missionStops';
import { voyager } from '../../../../src/data/exhibits/voyager';
import { missionEventMs } from '../../../../src/utils/exhibits/timeline/missionEventMs';
import { dot3 } from '../../../../src/utils/math/dot3';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { makeDriverCtx } from '../../../helpers/camera/makeDriverCtx';
import { loadVoyagerStopWindows } from '../../../helpers/missions/loadVoyagerStopWindows';

const neptune = MISSION_EVENTS.find((e) => e.id === 'voyager2-neptune') as MissionEvent;
const tc = unixMsToJulianDays(missionEventMs(neptune));
const FOV = 0.9;
const ASPECT = 16 / 9;
const BASIS = ORIENTATION_FRAMES.equatorial;
const FRAME_MS = 16;

beforeAll(loadVoyagerStopWindows);

function missionOf(offsets = { yaw: 0, pitch: 0, zoom: 1 }, retarget = 0): CameraMission {
  return {
    craftId: 'voyager2',
    stops: missionStops(MISSION_EVENTS.filter((e) => e.bodyId === 'voyager2')),
    cruise: { yaw: voyager.pose.yaw, pitch: voyager.pose.pitch },
    offsets,
    speedIndex: 2,
    retarget,
  };
}

function ctxAt(mission: CameraMission, simDays: number, winnerLastFrame: DriverId = 'resting') {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setMission(mission));
  return makeDriverCtx({
    state: store.getState(),
    simDays,
    poseBasis: BASIS,
    projection: { fovYRad: FOV, aspect: ASPECT, near: 0, far: 1 },
    winnerLastFrame,
  });
}

function inFrustum(eye: Vec3, aim: Vec3, p: Vec3): boolean {
  const fwd = normalize3([aim[0] - eye[0], aim[1] - eye[1], aim[2] - eye[2]]);
  const d = normalize3([p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]);
  return Math.acos(dot3(fwd, d)) < Math.atan(Math.tan(FOV / 2) * Math.min(1, ASPECT));
}

function worldPose(ctx: ReturnType<typeof ctxAt>) {
  const { pose } = missionPose(ctx, null);
  if (pose.frame !== 'absolute') throw new Error('expected the world arm');
  return pose.pose;
}

describe('missionPose', () => {
  it('looks along the flyby normal at closest approach, zero offsets', () => {
    const pose = worldPose(ctxAt(missionOf(), tc));
    const eye = eyeMpcOf(pose, BASIS);
    const back = normalize3([
      eye[0] - pose.target[0],
      eye[1] - pose.target[1],
      eye[2] - pose.target[2],
    ]);
    expect(dot3(back, flybyNormal(neptune)!)).toBeCloseTo(-1, 9);
  });

  it.each([-2, 0, 2])('keeps Voyager 2 and Neptune in frame at closest %+d d', (dDays) => {
    const pose = worldPose(ctxAt(missionOf(), tc + dDays));
    const eye = eyeMpcOf(pose, BASIS);
    const states = deriveBodyStates(tc + dDays);
    const craft = states.get('voyager2' as BodyId)!.positionMpc;
    const target = states.get('neptune' as BodyId)!.positionMpc;
    expect(inFrustum(eye, pose.target, craft)).toBe(true);
    expect(inFrustum(eye, pose.target, target)).toBe(true);
  });

  it('writes the offsets a released drag left behind', () => {
    const want = { yaw: 0.4, pitch: -0.25, zoom: 1.8 };
    // The pose the same mission shows once those offsets are in the store.
    const shown = worldPose(ctxAt(missionOf(want), tc));
    const ctx = ctxAt(missionOf(), tc, 'orbitDrag');
    const released = missionPose({ ...ctx, committedWorld: shown }, null);
    const payload = (released.actions?.[0] as { payload: typeof want }).payload;
    expect(payload.yaw).toBeCloseTo(want.yaw, 9);
    expect(payload.pitch).toBeCloseTo(want.pitch, 9);
    expect(payload.zoom).toBeCloseTo(want.zoom, 9);
  });

  it('turns a swallowed wheel notch into a zoom offset', () => {
    const ctx = ctxAt(missionOf(), tc, 'mission');
    const dist = missionPose(ctx, null).memory!.distanceTarget!;
    const zoomed = missionPose({ ...ctx, followDistanceTarget: dist * 0.5 }, null);
    const payload = (zoomed.actions?.[0] as { payload: { zoom: number } }).payload;
    expect(payload.zoom).toBeCloseTo(0.5, 9);
  });

  it('emits nothing when the offsets did not change', () => {
    expect(missionPose(ctxAt(missionOf(), tc, 'mission'), null).actions).toBeUndefined();
  });

  describe('ease after a re-aim', () => {
    const from = {
      target: [1e-9, 2e-9, 3e-9] as Vec3,
      yaw: 1.2,
      pitch: 0.3,
      distance: 5e-7,
    };
    // The step's first frame (elapsed 0) captures `from`; later frames carry that memory.
    const eased = (elapsedMs: number) => {
      const base = ctxAt(missionOf(undefined, 1), tc);
      const first = missionPose({ ...base, elapsedMs: 0, authoredWorld: from }, null);
      const ctx = { ...base, elapsedMs, authoredWorld: from };
      const { pose } = missionPose(ctx, first.memory);
      if (pose.frame !== 'absolute') throw new Error('expected the world arm');
      return pose.pose;
    };
    const exact = () => worldPose(ctxAt(missionOf(), tc));

    it('starts on the pose the camera was showing, though the craft is out of it', () => {
      const pose = eased(0);
      pose.target.forEach((v, i) => expect(v).toBeCloseTo(from.target[i]!, 18));
      expect(pose.distance).toBeCloseTo(from.distance, 12);
      expect(pose.yaw).toBeCloseTo(from.yaw, 9);
    });

    it('is the exact per-frame frame once the ease has run', () => {
      expect(eased(MISSION_EASE_MS)).toEqual(exact());
      expect(eased(MISSION_EASE_MS * 5)).toEqual(exact());
    });

    it('is in between part-way', () => {
      const mid = eased(MISSION_EASE_MS / 2);
      expect(mid.target).not.toEqual(from.target);
      expect(mid.target).not.toEqual(exact().target);
    });

    it('never eases a mission that has not re-aimed', () => {
      const ctx = { ...ctxAt(missionOf(), tc), elapsedMs: 0, authoredWorld: from };
      expect(worldPose(ctx)).toEqual(exact());
    });
  });

  /** Drives the driver frame by frame as the loop does: memory and the shown pose carried. */
  function drive(
    mission: CameraMission,
    frames: number,
    daysAt: (wallMs: number) => number,
    start: CameraPose,
    each: (pose: CameraPose, simDays: number, wallMs: number) => void,
  ) {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(setMission(mission));
    let mem: FollowMemory | null = null;
    let shown = start;
    for (let f = 0; f < frames; f++) {
      const wallMs = f * FRAME_MS;
      const simDays = daysAt(wallMs);
      const ctx = makeDriverCtx({
        state: store.getState(),
        simDays,
        elapsedMs: wallMs,
        poseBasis: BASIS,
        projection: { fovYRad: FOV, aspect: ASPECT, near: 0, far: 1 },
        winnerLastFrame: 'mission',
        authoredWorld: shown,
      });
      const out = missionPose(ctx, mem);
      if (out.pose.frame !== 'absolute') throw new Error('expected the world arm');
      mem = out.memory;
      shown = out.pose.pose;
      each(shown, simDays, wallMs);
    }
  }

  function craftInView(pose: CameraPose, simDays: number): boolean {
    const craft = deriveBodyStates(simDays).get('voyager2' as BodyId)!.positionMpc;
    return inFrustum(eyeMpcOf(pose, BASIS), pose.target, craft);
  }

  it('keeps the craft in view through a step’s ease on a paused clock', () => {
    const start = worldPose(ctxAt(missionOf(), tc - 30));
    let out = 0;
    drive(
      missionOf(undefined, 1),
      MISSION_EASE_MS / FRAME_MS + 2,
      () => tc - 2,
      start,
      (p, t) => {
        if (!craftInView(p, t)) out++;
      },
    );
    // Only the first frame may miss: the clock jumped and the shown pose is the old one.
    expect(out).toBeLessThanOrEqual(1);
  });

  it('keeps the craft in view, smoothly, through the post-flyby hand-off at 4×', () => {
    const stops = missionOf().stops;
    const from = tc + MISSION_FLYBY_LEAD_DAYS - 0.02;
    const profile = buildMissionProfile(
      stops,
      'voyager2',
      from,
      tc + 4000,
      MISSION_SPEEDS.indexOf(4),
      0,
    );
    const stopsSeen = new Set<unknown>();
    let out = 0;
    let jump = 0;
    let prev: CameraPose | null = null;
    drive(
      missionOf(),
      (MISSION_EASE_MS * 1.5) / FRAME_MS,
      (w) => interpolateMissionProfile(profile, w),
      worldPose(ctxAt(missionOf(), from)),
      (p, t) => {
        stopsSeen.add(t > tc + MISSION_FLYBY_LEAD_DAYS);
        if (!craftInView(p, t)) out++;
        if (prev) {
          const e0 = eyeMpcOf(prev, BASIS);
          const e1 = eyeMpcOf(p, BASIS);
          jump = Math.max(
            jump,
            Math.abs(Math.log(p.distance / prev.distance)),
            Math.hypot(e1[0] - e0[0], e1[1] - e0[1], e1[2] - e0[2]) / p.distance,
          );
        }
        prev = p;
      },
    );
    expect(stopsSeen.size).toBe(2); // the run crossed the trigger
    expect(out).toBe(0);
    // Smooth: no frame zooms or moves the eye by more than a tenth of the view.
    expect(jump).toBeLessThan(0.1);
  });

  describe('visitor offsets', () => {
    const want = { yaw: 0.4, pitch: -0.25, zoom: 1.8 };
    const run = (mission: CameraMission, steps: { ms: number; notch?: number }[]) => {
      const store = configureStore({ reducer: rootReducer });
      store.dispatch(setMission(mission));
      let mem: FollowMemory | null = null;
      let last: ReturnType<typeof missionPose> | null = null;
      for (const { ms, notch } of steps) {
        const ctx = makeDriverCtx({
          state: store.getState(),
          simDays: tc,
          elapsedMs: ms,
          poseBasis: BASIS,
          projection: { fovYRad: FOV, aspect: ASPECT, near: 0, far: 1 },
          winnerLastFrame: 'mission',
          followDistanceTarget: notch === undefined ? null : mem!.distanceTarget! * notch,
        });
        last = missionPose(ctx, mem);
        mem = last.memory;
        for (const a of last.actions ?? []) store.dispatch(a);
      }
      return { last: last!, offsets: store.getState().camera.mission!.offsets };
    };
    const poseOf = (r: ReturnType<typeof run>) => {
      if (r.last.pose.frame !== 'absolute') throw new Error('expected the world arm');
      return r.last.pose.pose;
    };

    it('holds for the idle wait, then ease back to the auto view', () => {
      const held = run(missionOf(want), [{ ms: 0 }, { ms: MISSION_EASE_MS - 1 }]);
      expect(poseOf(held)).toEqual(worldPose(ctxAt(missionOf(want), tc)));
      const mid = run(missionOf(want), [{ ms: 0 }, { ms: MISSION_EASE_MS * 1.5 }]);
      expect(poseOf(mid).distance).toBeLessThan(poseOf(held).distance);
      const back = run(missionOf(want), [{ ms: 0 }, { ms: MISSION_EASE_MS * 2 }]);
      expect(poseOf(back)).toEqual(worldPose(ctxAt(missionOf(), tc)));
      expect(back.offsets).toEqual({ yaw: 0, pitch: 0, zoom: 1 });
    });

    it('a new input cancels the ease back', () => {
      const r = run(missionOf(want), [
        { ms: 0 },
        { ms: MISSION_EASE_MS * 1.5, notch: 1 },
        { ms: MISSION_EASE_MS * 2.5 },
      ]);
      expect(r.offsets.yaw).toBeGreaterThan(0.1);
      expect(r.offsets.yaw).toBeLessThan(want.yaw);
      expect(poseOf(r)).toEqual(worldPose(ctxAt(missionOf(r.offsets), tc)));
    });
  });
});
