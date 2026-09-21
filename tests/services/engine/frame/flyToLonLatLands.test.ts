/**
 * flyToLonLatLands — the `camera/flyToLonLat` command, saga and real runFrame
 * together: the camera must still stand where it was sent frames after the
 * flight ends, whatever focus or follow row is active when it lands.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { runSaga, stdChannel } from 'redux-saga';
import type { UnknownAction } from '@reduxjs/toolkit';

import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { watchFlyToLonLatSaga } from '../../../../src/state/camera/watchFlyToLonLatSaga';
import { watchSelectionRowsSaga } from '../../../../src/state/selectionRows/watchSelectionRowsSaga';
import { flyToLonLat } from '../../../../src/state/camera/flyToLonLatActions';
import type { FlyToLonLatPayload } from '../../../../src/state/camera/flyToLonLatActions';
import { resume } from '../../../../src/state/time/timeSlice';
import { selectTimeState } from '../../../../src/state/time/selectors';
import { deriveSimDays } from '../../../../src/utils/time/deriveSimDays';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { liveUpBasisQuat } from '../../../../src/services/engine/camera/liveUpBasisQuat';
import { toBodyArm } from '../../../../src/services/engine/camera/poseFrameConversion';
import { bodyFocusDistance } from '../../../../src/services/engine/camera/bodyFocusDistance';
import { bodyFixedEyeM } from '../../../../src/utils/camera/bodyFixedEyeM';
import { eyeFrameOf } from '../../../../src/utils/camera/eyeFrameOf';
import { directionToLonLatDeg } from '../../../../src/utils/geo/directionToLonLatDeg';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { BODY_LOCAL_FRAME } from '../../../../src/data/camera/bodyLocalFrame';
import { FLY_TO_LON_LAT_TWEEN_MS } from '../../../../src/data/camera/flyToLonLatTweenMs';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { bodyFootprintRadiusM } from '../../../../src/utils/scene/bodyFootprintRadiusM';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { CameraSimHarness } from '../../../helpers/camera/CameraSimHarness';
import type { SimBodyId } from '../../../helpers/camera/SimBodyId';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';

// Past the flight, then a further stretch the result must survive unchanged.
const FLIGHT_FRAMES = Math.ceil(FLY_TO_LON_LAT_TWEEN_MS / 16) + 10;
const HOLD_FRAMES = 60;
// A lost command misses by thousands of km; these bound only the Mpc
// round-trips at ~1 AU (a few mm of f64 grain per conversion): 5 decimals of a
// degree is ~1 m on Earth, then 1 m of altitude and 1e-5 rad of heading.
const DEG_TOL = 5;
const ALT_TOL_M = 1;
const HEADING_TOL_RAD = 1e-5;

/** The harness wired to the fly-to saga plus the focus-row reconciler it relies on. */
function setup(): { h: CameraSimHarness; fly: (p: FlyToLonLatPayload) => void } {
  const h = makeCameraSimHarness();
  const channel = stdChannel();
  const dispatch = (action: UnknownAction): void => {
    h.store.dispatch(action);
    channel.put(action);
  };
  const env = {
    channel,
    dispatch,
    getState: h.store.getState,
    context: {
      cameraRuntime: () => ({
        from: liveWorldPose(h.state),
        fovYRad: h.state.cameraRuntime.outputs.projection.fovYRad,
        upBasisQuat: liveUpBasisQuat(h.state.cameraRuntime),
      }),
      selection: {
        extractRow: (ref: SelectionRef | null) => {
          if (ref?.type !== 'body') return null;
          const p = h.bodies.get(ref.id)!.positionMpc;
          return { type: 'body', id: ref.id, label: ref.id, positionMpc: [p[0]!, p[1]!, p[2]!] };
        },
      },
    },
  };
  runSaga(env, watchSelectionRowsSaga);
  runSaga(env, watchFlyToLonLatSaga);
  return { h, fly: (p) => dispatch(flyToLonLat(p)) };
}

/** Where the DISPLAYED camera stands over `id`: sub-camera point, altitude, heading.
 *  `bodyState` defaults to the harness's frozen map, which only describes the
 *  paused clock every case but the moving-body one runs on. */
function standpoint(h: CameraSimHarness, id: SimBodyId, bodyState = h.bodies.get(id)!) {
  const basis = ORIENTATION_FRAMES[h.store.getState().settings.orientation];
  const arm = toBodyArm(liveWorldPose(h.state), basis, basis, id as BodyId, bodyState);
  const eyeM = bodyFixedEyeM(arm);
  return {
    ...directionToLonLatDeg(normalize3(eyeM)),
    altM: Math.hypot(...eyeM) - h.radiusM(id),
    headingRad: eyeFrameOf(arm, 1, BODY_LOCAL_FRAME.pole)!.azimuthRad,
  };
}

function expectStandpoint(
  h: CameraSimHarness,
  id: SimBodyId,
  want: { lonDeg: number; latDeg: number; altM: number; headingRad: number },
): void {
  const got = standpoint(h, id);
  expect(got.lonDeg).toBeCloseTo(want.lonDeg, DEG_TOL);
  expect(got.latDeg).toBeCloseTo(want.latDeg, DEG_TOL);
  expect(Math.abs(got.altM - want.altM)).toBeLessThan(ALT_TOL_M);
  expect(Math.abs(got.headingRad - want.headingRad)).toBeLessThan(HEADING_TOL_RAD);
}

/** Fly, then assert the landing both right after the flight and a while later. */
function flyAndHold(
  h: CameraSimHarness,
  fly: () => void,
  id: SimBodyId,
  want: Parameters<typeof expectStandpoint>[2],
): void {
  fly();
  h.frame(FLIGHT_FRAMES);
  expectStandpoint(h, id, want);
  h.frame(HOLD_FRAMES);
  expectStandpoint(h, id, want);
}

describe('flyToLonLat through the frame loop', () => {
  it('lands and holds over Earth while Earth is the followed focus', () => {
    const { h, fly } = setup();
    h.frame(5);
    flyAndHold(h, () => fly({ lonDeg: 12, latDeg: 55, altKm: 900 }), 'earth', {
      lonDeg: 12,
      latDeg: 55,
      altM: 900_000,
      headingRad: 0,
    });
  });

  it('carries an explicit heading through the landing', () => {
    const { h, fly } = setup();
    h.frame(5);
    flyAndHold(h, () => fly({ lonDeg: -70, latDeg: -20, altKm: 500, headingRad: 1.1 }), 'earth', {
      lonDeg: -70,
      latDeg: -20,
      altM: 500_000,
      headingRad: 1.1,
    });
  });

  it('keeps the current altitude and heading when they are omitted on the same body', () => {
    const { h, fly } = setup();
    h.frame(5);
    fly({ lonDeg: 0, latDeg: 10, altKm: 1500, headingRad: 0.7 });
    h.frame(FLIGHT_FRAMES);
    flyAndHold(h, () => fly({ lonDeg: 30, latDeg: 40 }), 'earth', {
      lonDeg: 30,
      latDeg: 40,
      altM: 1_500_000,
      headingRad: 0.7,
    });
  });

  it('switches focus to another body, framed as a click-to-focus, north up', () => {
    const { h, fly } = setup();
    h.frame(5);
    // The distance the follow driver frames a focused Mars at (harness FOV 60°).
    const footprintM = bodyFootprintRadiusM(findByIdOrThrow(SCENE_BODIES, 'mars', 'test'));
    const framingM =
      bodyFocusDistance(footprintM * SCALE_UNITS.M_TO_MPC, Math.PI / 3) / SCALE_UNITS.M_TO_MPC;
    flyAndHold(h, () => fly({ body: 'mars' as BodyId, lonDeg: 137, latDeg: -5 }), 'mars', {
      lonDeg: 137,
      latDeg: -5,
      altM: framingM - h.radiusM('mars'),
      headingRad: 0,
    });
    expect(h.store.getState().selection.focus).toEqual({ type: 'body', id: 'mars' });
    expect(h.store.getState().selectionRows.focus).toMatchObject({ id: 'mars' });
  });

  it('aims at where the body WILL be, not where it was when the command ran', () => {
    const { h, fly } = setup();
    // Every case above runs on the harness's PAUSED clock, where a target built
    // against the body's dispatch-time state is indistinguishable from a correct
    // one. Running, it is not: the tween carries ABSOLUTE world poses, and Earth
    // covers ~45 km of its orbit during the 1.5 s flight — which landed the
    // camera tens of km east and kilometres UNDERGROUND (2026-09-18).
    vi.spyOn(performance, 'now').mockImplementation(() => h.nowMs());
    h.store.dispatch(resume({ nowMs: h.nowMs() }));
    h.frame(5);

    fly({ lonDeg: 12, latDeg: 55, altKm: 6 });
    h.frame(FLIGHT_FRAMES);

    const simDays = deriveSimDays(selectTimeState(h.store.getState()), h.nowMs());
    const got = standpoint(h, 'earth', deriveBodyStates(simDays).get('earth')!);
    // Not the 1 m the paused cases assert: the tween can only END on a frame
    // boundary, so up to one frame of orbital motion (~30 km/s × 16 ms ≈ 0.5 km)
    // survives the prediction. That is inside the narrowest baked band; the bug
    // this guards is two orders of magnitude bigger.
    const MOVING_TOL_M = 2_000;
    const groundErrM = Math.hypot(
      (got.lonDeg - 12) * Math.cos((55 * Math.PI) / 180) * 111_320,
      (got.latDeg - 55) * 111_320,
    );
    expect(groundErrM).toBeLessThan(MOVING_TOL_M);
    expect(Math.abs(got.altM - 6_000)).toBeLessThan(MOVING_TOL_M);
  });
});
