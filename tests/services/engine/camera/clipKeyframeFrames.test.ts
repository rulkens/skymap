/**
 * Frame-tagged keyframes (spec §8): a `set`/`setVec` endpoint names the frame
 * its `to` is read in, interpolation runs in that frame, and a leg whose
 * endpoints disagree converts its start ONCE.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { evaluateFramedClip } from '../../../../src/services/engine/camera/clips/evaluateClip';
import {
  all,
  dollyTo,
  moveTarget,
  seq,
  spin,
  tween,
} from '../../../../src/services/engine/animation/effectHelpers';
import { CAMERA_DRIVERS } from '../../../../src/services/engine/camera/drivers/cameraDrivers';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { foldToWorld } from '../../../../src/services/engine/camera/arms/foldToWorld';
import { rowFor } from '../../../../src/services/engine/camera/arms/rowFor';
import { bodyFixedEyeM } from '../../../../src/utils/camera/surfaceFrame/bodyFixedEyeM';
import { skySpotRadial } from '../../../../src/utils/geo/skySpotRadial';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';
import { decodeBodyFixedChannels } from '../../../../src/services/engine/camera/arms/body/utils/decodeBodyFixedChannels';
import { eyeMpcOf } from '../../../../src/utils/camera/orbitPose/eyeMpcOf';
import { yawPitchToDir } from '../../../../src/utils/camera/orbitPose/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { makeDriverCtx } from '../../../helpers/camera/makeDriverCtx';
import { rootReducer } from '../../../../src/store/rootReducer';
import { clipStarted } from '../../../../src/state/camera/cameraIntentSlice';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_CELESTIAL_BODIES } from '../../../../src/data/bodies/sceneCelestialBodies';
import { SKY_EYE_HEIGHT_M } from '../../../../src/services/engine/camera/arms/sky/data/skyEyeHeightM';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/pose/CameraPose';
import type { RootState } from '../../../../src/store/types';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { PositionedId } from '../../../../src/@types/scene/PositionedId';

vi.mock(
  '../../../../src/services/engine/camera/arms/body/toBodyFixedChannels',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/services/engine/camera/arms/body/toBodyFixedChannels')
      >();
    return { ...actual, toBodyFixedChannels: vi.fn(actual.toBodyFixedChannels) };
  },
);
import { toBodyFixedChannels } from '../../../../src/services/engine/camera/arms/body/toBodyFixedChannels';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { asSurfaceSiteId } from '../../../../src/utils/scene/asSurfaceSiteId';

const EARTH = { body: asSceneBodyId('earth') };
const BODIES = deriveBodyStates(CONST_J2000);
const BASIS = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const START: CameraPose = { target: [0, 0, 0], yaw: 0.5, pitch: 0.2, distance: 10 };
const CTX = {
  bodies: BODIES,
  poseBasis: BASIS,
  upBasis: BASIS,
  terrainHeightAt: datumOnlyTerrainHeight,
};
/** Søndermarken, the spot under `SONDERMARKEN_POSE`'s eye. */
const SPOT = {
  sky: {
    body: asSceneBodyId('earth'),
    lonRad: 0.21859354349348772,
    latRad: 0.9716130157244841,
  },
};
const R_EARTH_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'earth', 'clipKeyframeFrames.test')
  .surface.datumRadiusM;

/** The body arm's `decode` folded back out; production ships no such inverse. */
function fromBodyFixedChannels(channels: CameraPose, frame: typeof EARTH): CameraPose {
  return foldToWorld(rowFor(frame).channels.decode(channels, frame, CTX), CTX);
}

function opts(playback: object = {}) {
  return { bodies: BODIES, frameBasis: BASIS, playback };
}

/**
 * Both channels open on a zero-length body-framed endpoint, so the leg's own
 * first value is authored rather than converted — which is what lets the
 * midpoint below be hand-computed independently of the conversion.
 */
function earthLeg(): ClipData['timeline'][number] {
  return all([
    seq([moveTarget([0, 0, 7e6], 0, 'linear', EARTH), moveTarget([0, 0, 9e6], 4, 'linear', EARTH)]),
    seq([
      tween('distance', { to: 1e6, over: 0, frame: EARTH }),
      tween('distance', { to: 3e6, over: 4, frame: EARTH }),
    ]),
  ]);
}

function earthFramedClip(): ClipData {
  return { start: START, timeline: [earthLeg()] };
}

/** Strictly between, either direction — the two ends are fixture values, not authored. */
function between(from: number, mid: number, to: number): boolean {
  return (mid - from) * (mid - to) < 0;
}

/** The spot's standing eye in world Mpc, on datum ground, at these body states. */
function spotEyeMpc(bodies: ReadonlyMap<PositionedId, BodyState>): Vec3 {
  const earth = bodies.get(asSceneBodyId('earth'))!;
  const radial = skySpotRadial(SPOT.sky);
  const eyeM = (R_EARTH_M + SKY_EYE_HEIGHT_M) * SCALE_UNITS.M_TO_MPC;
  const eye = rotateVec3ByTightMat3(earth.orientation, [
    radial[0] * eyeM,
    radial[1] * eyeM,
    radial[2] * eyeM,
  ]);
  return [
    earth.positionMpc[0] + eye[0],
    earth.positionMpc[1] + eye[1],
    earth.positionMpc[2] + eye[2],
  ];
}

const distM = (a: Vec3, b: Vec3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / SCALE_UNITS.M_TO_MPC;

/** The world aim (target → eye is its negation) an absolute pose encodes. */
function aimOf(pose: CameraPose): Vec3 {
  const dir = rotateVec3ByTightMat3(BASIS, yawPitchToDir(pose.yaw, pose.pitch));
  return [-dir[0], -dir[1], -dir[2]];
}

describe('frame-tagged keyframes', () => {
  it('an untagged endpoint parses as absolute', () => {
    const data: ClipData = { start: START, timeline: [dollyTo(100, 2)] };

    expect(evaluateFramedClip(data, 1).frame).toBe('absolute');
  });

  it('a leg with disagreeing endpoints converts its start once, at leg start', () => {
    const data = earthFramedClip();
    const playback = {};
    vi.mocked(toBodyFixedChannels).mockClear();

    for (const t of [0, 0.5, 1, 2, 3, 4]) {
      evaluateFramedClip(data, t, opts(playback));
    }

    expect(toBodyFixedChannels).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toBodyFixedChannels).mock.calls[0]![1]).toBe('earth');
  });

  it('a body-framed leg interpolates in body-fixed metres', () => {
    const framed = evaluateFramedClip(earthFramedClip(), 2, opts());

    expect(framed.frame).toEqual(EARTH);
    // Linear midpoint of 7,000 km and 9,000 km along the body's own +Z.
    expect(framed.channels.target).toEqual([0, 0, 8e6]);
    // `distance` is a range in metres, interpolated in the channel's log space:
    // √(1e6 · 3e6) = 1e6·√3.
    expect(framed.channels.distance).toBeCloseTo(1e6 * Math.SQRT2 * Math.sqrt(1.5), 3);
  });

  it('a relative spin does not end the body leg it runs inside', () => {
    const data: ClipData = {
      start: START,
      timeline: [earthLeg(), spin('yaw', { by: Math.PI, over: 4 })],
    };

    expect(evaluateFramedClip(data, 1, opts()).frame).toEqual(EARTH);
    expect(evaluateFramedClip(data, 6, opts()).frame).toEqual(EARTH);
  });

  it("a leg's start converts with its OWN final values, not the next leg's opening cut", () => {
    // The cut is zero-length and absolute, so it opens the absolute leg AT the
    // instant the body leg ends: folding its 50 Mpc into the pose handed to the
    // conversion would read it as 50 metres of range.
    const data: ClipData = { start: START, timeline: [earthLeg(), dollyTo(50, 0)] };
    const openingAngles = toBodyFixedChannels(START, asSceneBodyId('earth'), BODIES, BASIS);
    const expected = fromBodyFixedChannels(
      {
        target: [0, 0, 9e6],
        yaw: openingAngles.yaw,
        pitch: openingAngles.pitch,
        distance: 3e6,
      },
      EARTH,
    );

    const framed = evaluateFramedClip(data, 4, opts());

    expect(framed.frame).toBe('absolute');
    expect(framed.channels.target).toEqual(expected.target);
  });

  it('a lens tween beside a body leg opens no absolute leg', () => {
    const data: ClipData = {
      start: { ...START, fov: 1 },
      timeline: [all([earthLeg(), tween('fov', { to: 0.5, over: 4 })])],
    };

    const framed = evaluateFramedClip(data, 2, opts());

    expect(framed.frame).toEqual(EARTH);
    expect(between(1, framed.channels.fov!, 0.5)).toBe(true);
  });

  it('absolute → body → absolute keeps the eye and the aim', () => {
    const pose: CameraPose = {
      target: BODIES.get(asSceneBodyId('earth'))!.positionMpc,
      yaw: 0.9,
      pitch: -0.3,
      distance: 3e-10,
    };

    const back = fromBodyFixedChannels(
      toBodyFixedChannels(pose, asSceneBodyId('earth'), BODIES, BASIS),
      EARTH,
    );

    const [ex, ey, ez] = eyeMpcOf(pose, BASIS);
    const [bx, by, bz] = eyeMpcOf(back, BASIS);
    // Relative to the range, so the tolerance means something at this scale.
    expect(Math.hypot(bx - ex, by - ey, bz - ez) / pose.distance).toBeLessThan(1e-9);
    const a = aimOf(pose);
    const b = aimOf(back);
    expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeCloseTo(1, 12);
  });

  it('a clip leg tagged { site } evaluates in the site arm, tweening from its converted start', () => {
    const CURIOSITY = { site: asSurfaceSiteId('curiosity') };
    const HEADING_RAD = 0.7;
    const ELEVATION_RAD = 0.2;
    const RANGE_M = 12;
    const siteLeg: ClipData['timeline'][number] = all([
      tween('yaw', { to: HEADING_RAD, over: 4, frame: CURIOSITY }),
      tween('pitch', { to: ELEVATION_RAD, over: 4, frame: CURIOSITY }),
      tween('distance', { to: RANGE_M, over: 4, frame: CURIOSITY }),
    ]);
    const data: ClipData = { start: START, timeline: [siteLeg] };

    // MID-tween, not at the end: at `t = 4` the value is the authored `to`
    // whatever the leg-open conversion produced, so the site arm's `decode`
    // would not be on the measured path at all.
    const open = evaluateFramedClip(data, 0, opts());
    const mid = evaluateFramedClip(data, 2, opts());

    expect(mid.frame).toEqual(CURIOSITY);
    expect(between(open.channels.yaw, mid.channels.yaw, HEADING_RAD)).toBe(true);
    expect(between(open.channels.pitch, mid.channels.pitch, ELEVATION_RAD)).toBe(true);
    expect(between(open.channels.distance, mid.channels.distance, RANGE_M)).toBe(true);
  });

  it('a pitch tween in a sky leg holds the eye on the spot while the body turns', () => {
    const skyLeg: ClipData['timeline'][number] = all([
      tween('yaw', { to: 0.4, over: 0, frame: SPOT }),
      tween('pitch', { to: 1.0, over: 4, frame: SPOT }),
    ]);
    const data: ClipData = { start: START, timeline: [skyLeg] };
    const playback = {};
    const later = deriveBodyStates(CONST_J2000 + 0.25);

    const eyes = (
      [
        [0, BODIES],
        [2, later],
      ] as const
    ).map(([t, bodies]) => {
      const framed = evaluateFramedClip(data, t, { bodies, frameBasis: BASIS, playback });
      expect(framed.frame).toEqual(SPOT);
      const ctx = { ...CTX, bodies };
      const world = foldToWorld(rowFor(SPOT).channels.decode(framed.channels, SPOT, ctx), ctx);
      const eye = eyeMpcOf(world, BASIS);
      expect(distM(eye, spotEyeMpc(bodies))).toBeLessThan(1);
      return { eye, pitch: framed.channels.pitch };
    });

    // A quarter day of orbit and spin: the eye rode the ground, not the sky.
    expect(distM(eyes[0]!.eye, eyes[1]!.eye)).toBeGreaterThan(1e6);
    expect(between(eyes[0]!.pitch, eyes[1]!.pitch, 1.0)).toBe(true);
  });

  it('an absolute → sky leg opens looking where the start looked', () => {
    // Aimed from 1 km out at the spot's own eye, so the leg-open fold is a
    // turn in place rather than a leap to somewhere else on Earth.
    const start: CameraPose = {
      target: spotEyeMpc(BODIES),
      yaw: 0.9,
      pitch: -0.3,
      distance: 1e3 * SCALE_UNITS.M_TO_MPC,
    };
    const data: ClipData = {
      start,
      timeline: [tween('pitch', { to: 1.0, over: 4, frame: SPOT })],
    };

    const open = evaluateFramedClip(data, 0, opts());
    const world = foldToWorld(rowFor(SPOT).channels.decode(open.channels, SPOT, CTX), CTX);

    const a = aimOf(start);
    const b = aimOf(world);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1e-6);
  });

  it('a sky → body leg starts at the standing eye', () => {
    const terrainM = 120;
    const data: ClipData = {
      start: START,
      timeline: [
        // A zero-length snap, then the rise from the same instant: the leg that
        // runs on from a shared instant owns it.
        all([
          tween('yaw', { to: 0.4, over: 0, frame: SPOT }),
          tween('pitch', { to: 0.3, over: 0, frame: SPOT }),
        ]),
        tween('distance', { to: 5e3, over: 4, frame: EARTH }),
      ],
    };

    const framed = evaluateFramedClip(data, 0, {
      ...opts(),
      terrainHeightAt: () => terrainM,
    });

    expect(framed.frame).toEqual(EARTH);
    const arm = decodeBodyFixedChannels(framed.channels, asSceneBodyId('earth'));
    // On datum this reads R + 1.7: the rise would open inside the hill (#1019's P2).
    expect(
      Math.hypot(...bodyFixedEyeM(arm)) - (R_EARTH_M + terrainM + SKY_EYE_HEIGHT_M),
    ).toBeCloseTo(0, 3);
  });

  it('the clip driver hands out a decoded body arm, never a re-encoded absolute one', () => {
    const store = configureStore({ reducer: rootReducer });
    const data = earthFramedClip();
    store.dispatch(clipStarted({ data, frame: DEFAULT_ORIENTATION }));
    const state = store.getState() as unknown as RootState;
    const clipRow = CAMERA_DRIVERS.find((d) => d.id === 'clip')!;

    const { pose } = clipRow.pose(
      makeDriverCtx({ state, elapsedMs: 2000, bodies: BODIES }),
      null,
      null,
    );

    expect(pose.frame).toEqual(EARTH);
    // The same LookAt decode the evaluator's channels imply — body-fixed metres,
    // with no orientation re-encode applied to them on the way out.
    const channels = evaluateFramedClip(data, 2, opts(state.camera.intent.clip!)).channels;
    expect(pose.pose).toEqual(decodeBodyFixedChannels(channels, asSceneBodyId('earth')));
  });
});
