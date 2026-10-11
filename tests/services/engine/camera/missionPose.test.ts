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
import { beginDrag, endDrag, setMission } from '../../../../src/state/camera/cameraSlice';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { rootReducer } from '../../../../src/store/rootReducer';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { bodyRelativeState } from '../../../../src/utils/exhibits/mission/bodyRelativeState';
import { orbitAnglesLookingAlong } from '../../../../src/utils/camera/orbitAnglesLookingAlong';
import { missionStops } from '../../../../src/utils/exhibits/mission/missionStops';
import { voyagerMissions } from '../../../../src/data/exhibits/voyagerMissions';
import { missionEventMs } from '../../../../src/utils/exhibits/timeline/missionEventMs';
import { bodyRadiusMpc } from '../../../../src/utils/camera/bodyRadiusMpc';
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

function missionOf(
  offsets = { yaw: 0, pitch: 0, zoom: 1 },
  retarget = 0,
  craftId = 'voyager2',
): CameraMission {
  return {
    craftId,
    stops: missionStops(MISSION_EVENTS.filter((e) => e.bodyId === craftId)),
    cruise: { yaw: voyagerMissions.pose.yaw, pitch: voyagerMissions.pose.pitch },
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
  it('looks from outside the bend at the cruise height above the ecliptic, zero offsets', () => {
    const pose = worldPose(ctxAt(missionOf(), tc));
    const eye = eyeMpcOf(pose, BASIS);
    const ecliptic = ORIENTATION_FRAMES.ecliptic;
    const view = orbitAnglesLookingAlong(
      [pose.target[0] - eye[0], pose.target[1] - eye[1], pose.target[2] - eye[2]],
      ecliptic,
    );
    expect(view.pitch).toBeCloseTo(voyagerMissions.pose.pitch, 9);
    // Eye beyond the craft on the planet's far side from it at closest approach.
    const { rKm } = bodyRelativeState('voyager2', 'neptune', tc)!;
    const outside = orbitAnglesLookingAlong([-rKm[0], -rKm[1], -rKm[2]], ecliptic);
    expect(view.yaw).toBeCloseTo(outside.yaw, 9);
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

  it('writes the offsets a live drag holds the view at', () => {
    const want = { yaw: 0.4, pitch: -0.25, zoom: 1.8 };
    // The pose the same mission shows once those offsets are in the store.
    const shown = worldPose(ctxAt(missionOf(want), tc));
    const ctx = ctxAt(missionOf(), tc, 'mission');
    const dragging = { ...ctx.state, camera: { ...ctx.state.camera, dragging: true } };
    const held = missionPose({ ...ctx, state: dragging, authoredWorld: shown }, null);
    const payload = (held.actions?.[0] as { payload: typeof want }).payload;
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

  describe('zooming in at a launch', () => {
    const launch = MISSION_EVENTS.find((e) => e.id === 'voyager1-launch') as MissionEvent;
    const t = unixMsToJulianDays(missionEventMs(launch)) + 1 / 24;
    const zoomed = missionOf({ yaw: 0, pitch: 0, zoom: 0.01 }, 0, 'voyager1');
    const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    it('keeps the eye outside the planet and slides the aim to the craft', () => {
      const states = deriveBodyStates(t);
      const earth = states.get('earth' as BodyId)!.positionMpc;
      const craft = states.get('voyager1' as BodyId)!.positionMpc;
      const pose = worldPose(ctxAt(zoomed, t));
      const exact = worldPose(ctxAt(missionOf(undefined, 0, 'voyager1'), t));
      expect(dist(eyeMpcOf(pose, BASIS), earth)).toBeGreaterThanOrEqual(bodyRadiusMpc('earth'));
      expect(dist(pose.target, craft)).toBeLessThan(dist(exact.target, craft));
    });

    it('stops in front of the planet and writes that zoom back, so notches do not pile up', () => {
      // Zoom 0.01 puts the eye inside Earth, on the far side of it from the craft.
      const ctx = ctxAt(missionOf(undefined, 0, 'voyager1'), t, 'mission');
      const dist1 = missionPose(ctx, null).memory!.distanceTarget!;
      const out = missionPose({ ...ctx, followDistanceTarget: dist1 * 0.01 }, null);
      const zoom = (out.actions?.[0] as { payload: { zoom: number } }).payload.zoom;
      expect(zoom).toBeLessThan(0.01);
      if (out.pose.frame !== 'absolute') throw new Error('expected the world arm');
      const earth = deriveBodyStates(t).get('earth' as BodyId)!.positionMpc;
      const eye = eyeMpcOf(out.pose.pose, BASIS);
      expect(dist(eye, earth) / bodyRadiusMpc('earth')).toBeCloseTo(1.02, 6);
      const again = worldPose(ctxAt(missionOf({ yaw: 0, pitch: 0, zoom }, 0, 'voyager1'), t));
      expect(again.distance / out.pose.pose.distance).toBeCloseTo(1, 9);
    });
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

  it('a drag turns the view about the moving craft at 1×, zoomed in, and releases in place', () => {
    const stops = missionOf().stops;
    const profile = buildMissionProfile(
      stops,
      'voyager2',
      tc - 0.3,
      tc + 5,
      MISSION_SPEEDS.indexOf(1),
      0,
    );
    let w0 = 0;
    while (interpolateMissionProfile(profile, w0) < tc) w0 += FRAME_MS;
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(setMission(missionOf({ yaw: 0, pitch: 0, zoom: 0.05 })));
    let mem: FollowMemory | null = null;
    let shown: CameraPose | null = null;
    let out = 0;
    const frame = (f: number) => {
      const simDays = interpolateMissionProfile(profile, w0 + f * FRAME_MS);
      // The drag rung steps last frame's pose; here a steady yaw per frame.
      const register = shown && { ...shown, yaw: shown.yaw + 0.003 };
      const r = missionPose(
        makeDriverCtx({
          state: store.getState(),
          simDays,
          elapsedMs: f * FRAME_MS,
          poseBasis: BASIS,
          projection: { fovYRad: FOV, aspect: ASPECT, near: 0, far: 1 },
          winnerLastFrame: 'mission',
          ...(register && { register: absoluteArm(register), authoredWorld: register }),
        }),
        mem,
      );
      for (const a of r.actions ?? []) store.dispatch(a);
      if (r.pose.frame !== 'absolute') throw new Error('expected the world arm');
      mem = r.memory;
      shown = r.pose.pose;
      if (!craftInView(shown, simDays)) out++;
      return shown;
    };
    frame(0);
    store.dispatch(beginDrag());
    let f = 1;
    for (; f < 125; f++) frame(f);
    expect(out).toBe(0);
    expect(Math.abs(store.getState().camera.mission!.offsets.yaw)).toBeGreaterThan(0.2);
    const held = shown!;
    store.dispatch(endDrag());
    const released = frame(f);
    // The aim moves on with the craft as on any frame; the view and its distance hold.
    expect(Math.abs(released.yaw - held.yaw)).toBeLessThan(0.005);
    expect(Math.abs(released.pitch - held.pitch)).toBeLessThan(0.005);
    expect(Math.abs(Math.log(released.distance / held.distance))).toBeLessThan(0.005);
    expect(out).toBe(0);
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
