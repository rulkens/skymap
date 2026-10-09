import { beforeAll, describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { CameraMission } from '../../../../src/@types/camera/CameraMission';
import type { DriverId } from '../../../../src/@types/engine/camera/DriverId';
import type { MissionEvent } from '../../../../src/@types/missions/MissionEvent';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
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
import FLYBY from '../../../fixtures/voyager2NeptuneFlyby.json';

const neptune = MISSION_EVENTS.find((e) => e.id === 'voyager2-neptune') as MissionEvent;
const tc = unixMsToJulianDays(missionEventMs(neptune));
const FOV = 0.9;
const ASPECT = 16 / 9;
const BASIS = ORIENTATION_FRAMES.equatorial;

beforeAll(() => {
  trajectoryRegistry.set({
    id: 'voyager2',
    tDays: Float64Array.from(FLYBY.track.tDays),
    posKm: Float64Array.from(FLYBY.track.posKm),
    velKmS: Float32Array.from(FLYBY.track.velKmS),
  });
});

function missionOf(offsets = { yaw: 0, pitch: 0, zoom: 1 }): CameraMission {
  return {
    craftId: 'voyager2',
    stops: missionStops(MISSION_EVENTS.filter((e) => e.bodyId === 'voyager2')),
    cruise: { yaw: voyager.pose.yaw, pitch: voyager.pose.pitch },
    offsets,
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
});
