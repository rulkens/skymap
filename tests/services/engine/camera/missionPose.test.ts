import { beforeAll, describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { DriverCtx } from '../../../../src/@types/engine/camera/DriverCtx';
import type { MissionCameraMemory } from '../../../../src/@types/camera/MissionCameraMemory';
import type { MissionOffsets } from '../../../../src/@types/camera/MissionOffsets';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { FollowMemory } from '../../../../src/@types/engine/camera/FollowMemory';
import type { DriverId } from '../../../../src/@types/engine/camera/DriverId';
import type { MissionEvent } from '../../../../src/@types/missions/MissionEvent';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { MISSION_EASE_MS } from '../../../../src/data/exhibits/mission/missionEaseMs';
import { MISSION_FLYBY_LEAD_DAYS } from '../../../../src/data/exhibits/mission/missionFlybyLeadDays';
import { buildMissionProfile } from '../../../../src/utils/exhibits/mission/buildMissionProfile';
import { interpolateClockProfile } from '../../../../src/utils/time/interpolateClockProfile';
import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { missionPose } from '../../../../src/services/engine/camera/missionPose';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { aimCamera, beginDrag, endDrag } from '../../../../src/state/camera/cameraSlice';
import { setMissionCraft } from '../../../../src/state/settings/core/missions/slice';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { rootReducer } from '../../../../src/store/rootReducer';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { bodyRelativeState } from '../../../../src/utils/exhibits/mission/bodyRelativeState';
import { orbitAnglesLookingAlong } from '../../../../src/utils/camera/orbitAnglesLookingAlong';
import { missionStops } from '../../../../src/utils/exhibits/mission/missionStops';
import { voyagerTimeline } from '../../../helpers/missions/voyagerTimeline';
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

const TIMELINE = voyagerTimeline();

/** What the hold and the visitor leave behind: the craft, the aim's ease and the offsets. */
type Mission = {
  readonly craftId: string;
  readonly offsets: MissionOffsets;
  readonly reaim: boolean;
};

function missionOf(
  offsets: MissionOffsets = { yaw: 0, pitch: 0, zoom: 1 },
  reaim = false,
  craftId = 'voyager2',
): Mission {
  return { craftId, offsets, reaim };
}

const stopsOf = (craftId: string) =>
  missionStops(MISSION_EVENTS.filter((e) => e.bodyId === craftId));

/** A store with the craft selected and the aim token set, as the hold leaves it. */
function storeOf(mission: Mission) {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setMissionCraft(mission.craftId));
  store.dispatch(aimCamera({ ease: mission.reaim }));
  return store;
}

/** The row's slot holding the mission's offsets on the store's aim token, no view yet. */
function ownOf(store: ReturnType<typeof storeOf>, mission: Mission): MissionCameraMemory {
  return { aim: store.getState().camera.aim, offsets: mission.offsets, view: null };
}

/** A ctx carrying the row's first-frame slot along, so a spread copy keeps it. */
type MissionCtx = DriverCtx & { readonly own: MissionCameraMemory };

function ctxAt(
  mission: Mission,
  simDays: number,
  winnerLastFrame: DriverId = 'resting',
): MissionCtx {
  const store = storeOf(mission);
  const ctx = makeDriverCtx({
    state: store.getState(),
    simDays,
    poseBasis: BASIS,
    projection: { fovYRad: FOV, aspect: ASPECT, near: 0, far: 1 },
    winnerLastFrame,
  });
  return { ...ctx, own: ownOf(store, mission) };
}

const poseAt = (ctx: MissionCtx, mem: FollowMemory | null = null) =>
  missionPose(ctx, mem, ctx.own, TIMELINE);

function inFrustum(eye: Vec3, aim: Vec3, p: Vec3): boolean {
  const fwd = normalize3([aim[0] - eye[0], aim[1] - eye[1], aim[2] - eye[2]]);
  const d = normalize3([p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]);
  return Math.acos(dot3(fwd, d)) < Math.atan(Math.tan(FOV / 2) * Math.min(1, ASPECT));
}

function worldPose(ctx: ReturnType<typeof ctxAt>) {
  const { pose } = poseAt(ctx);
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
    expect(view.pitch).toBeCloseTo(TIMELINE.cruise.pitch, 9);
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
    const payload = poseAt({ ...ctx, state: dragging, authoredWorld: shown }).own!.offsets;
    expect(payload.yaw).toBeCloseTo(want.yaw, 9);
    expect(payload.pitch).toBeCloseTo(want.pitch, 9);
    expect(payload.zoom).toBeCloseTo(want.zoom, 9);
  });

  it('turns a swallowed wheel notch into a zoom offset', () => {
    const ctx = ctxAt(missionOf(), tc, 'mission');
    const dist = poseAt(ctx).memory!.distanceTarget!;
    const payload = poseAt({ ...ctx, followDistanceTarget: dist * 0.5 }).own!.offsets;
    expect(payload.zoom).toBeCloseTo(0.5, 9);
  });

  it('keeps the offsets it was handed when nothing touched them', () => {
    const ctx = ctxAt(missionOf(), tc, 'mission');
    expect(poseAt(ctx).own!.offsets).toBe(ctx.own.offsets);
  });

  it('drops the offsets on an entry, keeps them on an easing re-aim', () => {
    const want = { yaw: 0.4, pitch: -0.25, zoom: 1.8 };
    const stale = (reaim: boolean) => {
      const ctx = ctxAt(missionOf(want, reaim), tc, 'mission');
      // The slot is from an older token: a new entry or re-aim since.
      return poseAt({ ...ctx, own: { ...ctx.own, aim: { ease: false } } }).own!.offsets;
    };
    expect(stale(false)).toEqual({ yaw: 0, pitch: 0, zoom: 1 });
    expect(stale(true)).toEqual(want);
  });

  describe('zooming in at a launch', () => {
    const launch = MISSION_EVENTS.find((e) => e.id === 'voyager1-launch') as MissionEvent;
    const t = unixMsToJulianDays(missionEventMs(launch)) + 1 / 24;
    const zoomed = missionOf({ yaw: 0, pitch: 0, zoom: 0.01 }, false, 'voyager1');
    const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    it('keeps the eye outside the planet and slides the aim to the craft', () => {
      const states = deriveBodyStates(t);
      const earth = states.get('earth' as BodyId)!.positionMpc;
      const craft = states.get('voyager1' as BodyId)!.positionMpc;
      const pose = worldPose(ctxAt(zoomed, t));
      const exact = worldPose(ctxAt(missionOf(undefined, false, 'voyager1'), t));
      expect(dist(eyeMpcOf(pose, BASIS), earth)).toBeGreaterThanOrEqual(bodyRadiusMpc('earth'));
      expect(dist(pose.target, craft)).toBeLessThan(dist(exact.target, craft));
    });

    it('stops in front of the planet and writes that zoom back, so notches do not pile up', () => {
      // Zoom 0.01 puts the eye inside Earth, on the far side of it from the craft.
      const ctx = ctxAt(missionOf(undefined, false, 'voyager1'), t, 'mission');
      const dist1 = poseAt(ctx).memory!.distanceTarget!;
      const out = poseAt({ ...ctx, followDistanceTarget: dist1 * 0.01 });
      const zoom = out.own!.offsets.zoom;
      expect(zoom).toBeLessThan(0.01);
      if (out.pose.frame !== 'absolute') throw new Error('expected the world arm');
      const earth = deriveBodyStates(t).get('earth' as BodyId)!.positionMpc;
      const eye = eyeMpcOf(out.pose.pose, BASIS);
      expect(dist(eye, earth) / bodyRadiusMpc('earth')).toBeCloseTo(1.02, 6);
      const again = worldPose(ctxAt(missionOf({ yaw: 0, pitch: 0, zoom }, false, 'voyager1'), t));
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
      const base = ctxAt(missionOf(undefined, true), tc);
      const first = poseAt({ ...base, elapsedMs: 0, authoredWorld: from });
      const ctx = { ...base, elapsedMs, authoredWorld: from };
      const { pose } = missionPose(ctx, first.memory, first.own!, TIMELINE);
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
    mission: Mission,
    frames: number,
    daysAt: (wallMs: number) => number,
    start: CameraPose,
    each: (pose: CameraPose, simDays: number, wallMs: number) => void,
  ) {
    const store = storeOf(mission);
    let mem: FollowMemory | null = null;
    let own = ownOf(store, mission);
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
      const out = missionPose(ctx, mem, own, TIMELINE);
      if (out.pose.frame !== 'absolute') throw new Error('expected the world arm');
      mem = out.memory;
      own = out.own!;
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
      missionOf(undefined, true),
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
    const from = tc + MISSION_FLYBY_LEAD_DAYS - 0.02;
    const profile = buildMissionProfile(stopsOf('voyager2'), 'voyager2', from, tc + 4000, 4, 0);
    const stopsSeen = new Set<unknown>();
    let out = 0;
    let jump = 0;
    let prev: CameraPose | null = null;
    drive(
      missionOf(),
      (MISSION_EASE_MS * 1.5) / FRAME_MS,
      (w) => interpolateClockProfile(profile, w),
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
    const profile = buildMissionProfile(stopsOf('voyager2'), 'voyager2', tc - 0.3, tc + 5, 1, 0);
    let w0 = 0;
    while (interpolateClockProfile(profile, w0) < tc) w0 += FRAME_MS;
    const zoomedIn = missionOf({ yaw: 0, pitch: 0, zoom: 0.05 });
    const store = storeOf(zoomedIn);
    let own = ownOf(store, zoomedIn);
    let mem: FollowMemory | null = null;
    let shown: CameraPose | null = null;
    let out = 0;
    const frame = (f: number) => {
      const simDays = interpolateClockProfile(profile, w0 + f * FRAME_MS);
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
        own,
        TIMELINE,
      );
      own = r.own!;
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
    expect(Math.abs(own.offsets.yaw)).toBeGreaterThan(0.2);
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
    const run = (mission: Mission, steps: { ms: number; days?: number }[]) => {
      const store = storeOf(mission);
      let own = ownOf(store, mission);
      let mem: FollowMemory | null = null;
      let shown: CameraPose | undefined;
      const poses: CameraPose[] = [];
      for (const { ms, days = tc } of steps) {
        const ctx = makeDriverCtx({
          state: store.getState(),
          simDays: days,
          elapsedMs: ms,
          poseBasis: BASIS,
          projection: { fovYRad: FOV, aspect: ASPECT, near: 0, far: 1 },
          winnerLastFrame: 'mission',
          ...(shown && { authoredWorld: shown }),
        });
        const out = missionPose(ctx, mem, own, TIMELINE);
        if (out.pose.frame !== 'absolute') throw new Error('expected the world arm');
        mem = out.memory;
        own = out.own!;
        shown = out.pose.pose;
        poses.push(shown);
      }
      return { poses, offsets: own.offsets };
    };

    it('hold through any idle within one view', () => {
      const r = run(missionOf(want), [{ ms: 0 }, { ms: 10_000 }]);
      expect(r.poses[1]).toEqual(worldPose(ctxAt(missionOf(want), tc)));
      expect(r.offsets).toEqual(want);
    });

    it('reset with the ease into the next camera view', () => {
      const before = tc + MISSION_FLYBY_LEAD_DAYS - 0.02;
      const after = tc + MISSION_FLYBY_LEAD_DAYS + 0.02;
      const r = run(missionOf(want), [
        { ms: 0, days: before },
        { ms: FRAME_MS, days: after },
        { ms: FRAME_MS + MISSION_EASE_MS, days: after },
      ]);
      expect(r.offsets).toEqual({ yaw: 0, pitch: 0, zoom: 1 });
      // Eased, not snapped: the switch frame still shows the pose before it.
      expect(r.poses[1]!.distance / r.poses[0]!.distance).toBeCloseTo(1, 6);
      expect(r.poses[2]).toEqual(worldPose(ctxAt(missionOf(), after)));
    });
  });
});
