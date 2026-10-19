import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { RootState } from '../../../../src/store/types';
import type { VoyageCameraMemory } from '../../../../src/layers/voyage/@types/VoyageCameraMemory';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { JULIAN_YEAR_DAYS } from '../../../../src/data/time/julianYearDays';
import { MISSION_EASE_MS } from '../../../../src/data/exhibits/mission/missionEaseMs';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { VOYAGE_DESTINATIONS } from '../../../../src/data/voyage/voyageDestinations';
import { voyagePose } from '../../../../src/layers/voyage/exhibits/voyagePose';
import { voyageFrameBoost } from '../../../../src/utils/voyage/voyageFrameBoost';
import {
  setVoyageDestination,
  setVoyageLaunchDays,
} from '../../../../src/layers/voyage/state/voyage/slice';
import { aimCamera } from '../../../../src/state/camera/cameraSlice';
import { rootReducer } from '../../../../src/store/rootReducer';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { sphereFitDistance } from '../../../../src/utils/camera/sphereFitDistance';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { tripOf } from '../../../../src/utils/relativity/tripOf';
import { voyageTripLy } from '../../../../src/utils/voyage/voyageTripLy';
import { makeDriverCtx } from '../../../helpers/camera/makeDriverCtx';

const BASIS = ORIENTATION_FRAMES.equatorial;
const PROJECTION = { fovYRad: 0.9, aspect: 16 / 9, near: 0, far: 1 };
const AT_10_YR = CONST_J2000 + 10 * JULIAN_YEAR_DAYS;
const SECTION = { heading: 'Voyage' };

function storeToM31() {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setVoyageDestination('m31'));
  store.dispatch(setVoyageLaunchDays(CONST_J2000));
  store.dispatch(aimCamera({ ease: false }));
  return store;
}

type Frame = {
  readonly state: RootState;
  readonly simDays?: number;
  readonly elapsedMs?: number;
  readonly authoredWorld?: CameraPose;
};

function frame(f: Frame, own: VoyageCameraMemory | null) {
  const ctx = makeDriverCtx({
    state: f.state,
    simDays: f.simDays ?? AT_10_YR,
    elapsedMs: f.elapsedMs ?? 0,
    poseBasis: BASIS,
    projection: PROJECTION,
    winnerLastFrame: 'voyage',
    ...(f.authoredWorld && { authoredWorld: f.authoredWorld }),
  });
  const out = voyagePose(ctx, null, own, SECTION);
  if (out.pose.frame !== 'absolute') throw new Error('expected the world arm');
  return { pose: out.pose.pose, own: out.own! };
}

/** The pose's view direction from its angles, as the renderer decodes it. */
function forwardOf(pose: CameraPose): Vec3 {
  const back = rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), BASIS);
  return [-back[0], -back[1], -back[2]];
}

const near = (a: Readonly<Vec3>, b: Readonly<Vec3>, eps: number) =>
  a.forEach((c, i) => expect(Math.abs(c - b[i]!)).toBeLessThan(eps));

describe('voyagePose', () => {
  it('voyagePose sits at the ship looking along dir', () => {
    const store = storeToM31();
    const { pose } = frame({ state: store.getState() }, null);
    const boost = voyageFrameBoost(store.getState().settings.voyage, AT_10_YR)!;
    near(eyeMpcOf(pose, BASIS), boost.shipMpc, 1e-9);
    near(forwardOf(pose), boost.dir, 1e-6);
  });

  it('voyagePose frames the galaxy after arrival', () => {
    const store = storeToM31();
    const arrivedYr = tripOf(voyageTripLy(VOYAGE_DESTINATIONS.m31)).tEarthTotalYr + 1;
    const simDays = CONST_J2000 + arrivedYr * JULIAN_YEAR_DAYS;
    const { pose } = frame({ state: store.getState(), simDays }, null);
    expect(pose.target).toEqual([...VOYAGE_DESTINATIONS.m31.positionMpc]);
    expect(pose.distance).toBeCloseTo(
      sphereFitDistance(
        VOYAGE_DESTINATIONS.m31.arrivalRadiusMpc!,
        PROJECTION.fovYRad,
        PROJECTION.aspect,
      ),
      12,
    );
    near(forwardOf(pose), voyageFrameBoost(store.getState().settings.voyage, simDays)!.dir, 1e-9);
  });

  it('voyagePose keeps a drag offset until the next re-aim', () => {
    const store = storeToM31();
    const first = frame({ state: store.getState() }, null);
    // The drag rung orbits last frame's pose about its target.
    const dragged = { ...first.pose, yaw: first.pose.yaw + 0.3 };
    const dragging = {
      ...store.getState(),
      camera: { ...store.getState().camera, dragging: true },
    };
    const during = frame({ state: dragging, elapsedMs: 16, authoredWorld: dragged }, first.own);
    const held = frame({ state: store.getState(), elapsedMs: 5000 }, during.own);
    expect(held.own.offsets.yaw).not.toBeCloseTo(0, 3);
    expect(held.pose.yaw).toBeCloseTo(dragged.yaw, 9);
    near(
      eyeMpcOf(held.pose, BASIS),
      voyageFrameBoost(store.getState().settings.voyage, AT_10_YR)!.shipMpc,
      1e-9,
    );

    store.dispatch(aimCamera({ ease: true }));
    const reaimed = frame({ state: store.getState(), authoredWorld: held.pose }, held.own);
    expect(reaimed.own.offsets).toEqual({ yaw: 0, pitch: 0, zoom: 1 });
    // Eased, not snapped: the re-aim frame still shows the held view.
    expect(reaimed.pose.yaw).toBeCloseTo(held.pose.yaw, 9);
    const settled = frame(
      { state: store.getState(), elapsedMs: MISSION_EASE_MS, authoredWorld: reaimed.pose },
      reaimed.own,
    );
    expect(settled.pose.yaw).toBeCloseTo(first.pose.yaw, 9);
    expect(settled.pose.pitch).toBeCloseTo(first.pose.pitch, 9);
  });
});
