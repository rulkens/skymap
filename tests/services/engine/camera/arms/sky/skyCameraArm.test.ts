/**
 * skyCameraArm — a standing eye tagged by its spot. What can fail: the eye leaving
 * the live ground, the horizon tipping, the azimuth lost at the zenith/nadir or
 * at a polar spot, and a decline that hands back a fresh object.
 */

import { describe, it, expect } from 'vitest';

import { CAMERA_ARMS } from '../../../../../../src/services/engine/camera/arms/cameraArms';
import { frameKey } from '../../../../../../src/services/engine/camera/arms/frameKey';
import { deriveBodyStates } from '../../../../../../src/services/engine/frame/deriveBodyStates';
import { pivotFraming } from '../../../../../../src/services/engine/camera/framing/pivotRadiusMpc';
import { bodyFixedEyeM } from '../../../../../../src/utils/camera/surfaceFrame/bodyFixedEyeM';
import { findByIdOrThrow } from '../../../../../../src/utils/object/findByIdOrThrow';
import { symmetricFrustum } from '../../../../../../src/utils/camera/frustum/symmetricFrustum';
import { asSceneBodyId } from '../../../../../../src/utils/scene/asSceneBodyId';
import { SCENE_CELESTIAL_BODIES } from '../../../../../../src/data/bodies/sceneCelestialBodies';
import { DEFAULT_CAMERA_TUNING } from '../../../../../../src/data/camera/cameraTuning';
import { EMPTY_TILT_MEMORY } from '../../../../../../src/services/engine/camera/data/emptyTiltMemory';
import { SKY_EYE_HEIGHT_M } from '../../../../../../src/services/engine/camera/arms/sky/data/skyEyeHeightM';
import { ORIENTATION_FRAMES } from '../../../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../../../src/data/defaults';
import { CONST_J2000 } from '../../../../../../src/data/time/constJ2000';
import { LENS_MAX_DEG } from '../../../../../../src/data/camera/lensMaxDeg';
import { LENS_MIN_DEG } from '../../../../../../src/data/camera/lensMinDeg';
import { degToRad } from '../../../../../../src/utils/math/degToRad';
import { SKY_EXIT_ALTITUDE_M } from '../../../../../../src/services/engine/camera/arms/sky/data/skyExitAltitudeM';
import { DEFAULT_FOV_Y_RAD } from '../../../../../../src/services/engine/camera/framing/cameraFraming';
import { evaluateFramedClip } from '../../../../../../src/services/engine/camera/clips/evaluateClip';
import { decodeBodyFixedChannels } from '../../../../../../src/services/engine/camera/arms/body/utils/decodeBodyFixedChannels';
import { SKY_EXIT_PITCH_MS } from '../../../../../../src/services/engine/camera/arms/sky/data/skyExitPitchMs';
import { SKY_EXIT_CLIMB_MS } from '../../../../../../src/services/engine/camera/arms/sky/data/skyExitClimbMs';
import type { ClipData } from '../../../../../../src/@types/animation/ClipData';
import type { InputStep } from '../../../../../../src/@types/camera/input/InputStep';
import type { Vec2 } from '../../../../../../src/@types/math/Vec2';
import type { FrameOf } from '../../../../../../src/@types/camera/arms/FrameOf';
import type { FramedPose } from '../../../../../../src/@types/camera/pose/FramedPose';
import type { CameraArmCtx } from '../../../../../../src/@types/camera/arms/CameraArmCtx';
import type { SceneBodyId } from '../../../../../../src/@types/scene/SceneBodyId';
import type { SkySpot } from '../../../../../../src/@types/camera/pose/SkySpot';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../../../src/@types/math/Mat3';
import type { DragMode } from '../../../../../../src/@types/camera/input/DragMode';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const EARTH = asSceneBodyId('earth');
const R_EARTH_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'earth', 'skyCameraArm.test').surface
  .datumRadiusM;
const TERRAIN_M = 120;
const ROW = CAMERA_ARMS.sky;
const AZ = 2.0;

const spotAt = (lonRad: number, latRad: number): FrameOf['sky'] => ({
  sky: { body: EARTH, lonRad, latRad },
});
/** Søndermarken. */
const FRAME = spotAt(0.21859354349348772, 0.9716130157244841);

const radialOf = ({ lonRad, latRad }: SkySpot): Vec3 => [
  Math.cos(latRad) * Math.cos(lonRad),
  Math.cos(latRad) * Math.sin(lonRad),
  Math.sin(latRad),
];

function ctxFor(
  focusBodyId: SceneBodyId | null,
  calls: unknown[][] = [],
  terrainM = TERRAIN_M,
): CameraArmCtx {
  return {
    bodies: deriveBodyStates(CONST_J2000),
    poseBasis: B,
    upBasis: B,
    terrainHeightAt: (...args) => {
      calls.push(args);
      return args[0] === 'earth' ? terrainM : 0;
    },
    focusBodyId,
    bodilessFocus: false,
    pivot: pivotFraming(null),
    viewportPx: [100, 100],
    frustum: symmetricFrustum(Math.PI / 3, 1),
    fovYRad: Math.PI / 3,
    tuning: DEFAULT_CAMERA_TUNING,
  };
}

const framed = (azimuthRad: number, altitudeRad: number, frame = FRAME): FramedPose<'sky'> => ({
  frame,
  pose: { azimuthRad, altitudeRad },
});

const withLens = (fovYRad: number, terrainM = TERRAIN_M): CameraArmCtx => ({
  ...ctxFor(EARTH, [], terrainM),
  fovYRad,
});

const drag = (
  dx: number,
  dy: number,
  mode: DragMode = 'orbit',
  from: Vec2 = [50, 50],
): InputStep => ({
  kind: 'drag',
  mode,
  startPx: from,
  endPx: [from[0] + dx, from[1] + dy],
});

/** The body-fixed direction under pixel `px` (y down) through a right | up | forward basis. */
const rayAt = (m: Mat3, px: Readonly<Vec2>, f: number, centre: number): Vec3 => {
  const x = (px[0] - centre) / f;
  const y = (centre - px[1]) / f;
  return [0, 1, 2].map((i) => m[6 + i]! + x * m[i]! + y * m[3 + i]!) as unknown as Vec3;
};

/** Where body-fixed direction `d` lands on screen through basis `m`. */
const pixelOf = (m: Mat3, d: Vec3, f: number, centre: number): Vec2 => {
  const along = (col: number): number => d[0] * m[col]! + d[1] * m[col + 1]! + d[2] * m[col + 2]!;
  const z = along(6);
  return [centre + (f * along(0)) / z, centre - (f * along(3)) / z];
};

const wheel = (factor: number, fresh = true): InputStep => ({
  kind: 'zoom',
  factor,
  duringGesture: false,
  cursorPx: null,
  fresh,
});

const roundTrip = (start: FramedPose<'sky'>) => {
  const ctx = ctxFor(null);
  return ROW.fromParent(ROW.toParent(start, ctx), start.frame, ctx).pose;
};

describe('the sky arm', () => {
  it('toParent then fromParent returns the pose', () => {
    for (const altitudeRad of [-Math.PI / 2, -0.5, 0, 0.7, Math.PI / 2]) {
      const back = roundTrip(framed(AZ, altitudeRad));
      expect(back.altitudeRad).toBeCloseTo(altitudeRad, 9);
      expect(back.azimuthRad).toBeCloseTo(AZ, 9);
    }
  });

  it('the eye stands SKY_EYE_HEIGHT_M above the live terrain', () => {
    const calls: unknown[][] = [];
    const arm = ROW.toParent(framed(AZ, 0.3), ctxFor(null, calls)).pose;
    const eye = bodyFixedEyeM(arm);
    expect(Math.hypot(...eye) - (R_EARTH_M + TERRAIN_M + SKY_EYE_HEIGHT_M)).toBeCloseTo(0, 6);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('earth');
    const radial = radialOf(FRAME.sky);
    const dir = calls[0]![1] as Vec3;
    for (let i = 0; i < 3; i++) expect(dir[i]).toBeCloseTo(radial[i]!, 12);
  });

  it('the horizon is level', () => {
    const up = radialOf(FRAME.sky);
    for (const altitudeRad of [0, 0.7, Math.PI / 2]) {
      const m = ROW.toParent(framed(AZ, altitudeRad), ctxFor(null)).pose.basisLocal;
      expect(Math.abs(m[0] * up[0] + m[1] * up[1] + m[2] * up[2])).toBeLessThan(1e-12);
    }
  });

  it('a spot at the pole folds to a finite pose and round-trips', () => {
    const pole = spotAt(0.3, Math.PI / 2);
    const arm = ROW.toParent(framed(AZ, 0.4, pole), ctxFor(null)).pose;
    for (const v of arm.basisLocal) expect(Number.isFinite(v)).toBe(true);
    expect(roundTrip(framed(AZ, 0.4, pole)).altitudeRad).toBeCloseTo(0.4, 9);
  });

  it('an azimuth past π folds to the same view as its wrapped value', () => {
    const ctx = ctxFor(null);
    const past = ROW.toParent(framed((3 * Math.PI) / 2, 0.3), ctx).pose.basisLocal;
    const wrapped = ROW.toParent(framed(-Math.PI / 2, 0.3), ctx).pose.basisLocal;
    for (let i = 0; i < 9; i++) expect(past[i]).toBeCloseTo(wrapped[i]!, 12);
    const az = roundTrip(framed((3 * Math.PI) / 2, 0.3)).azimuthRad;
    expect(az).toBeGreaterThan(-Math.PI);
    expect(az).toBeLessThanOrEqual(Math.PI);
    expect(az).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('two spots differing only in longitude have different frameKeys', () => {
    expect(frameKey(spotAt(0.2, 0.9))).not.toBe(frameKey(spotAt(0.21, 0.9)));
  });

  it('drag turns the view at fovY / heightPx and the sky follows the pointer', () => {
    for (const deg of [1, 60, 120]) {
      const ctx = withLens(degToRad(deg));
      const start = framed(AZ, 0);
      const perPx = ctx.fovYRad / ctx.viewportPx[1];
      const right = ROW.step(ROW.emptyMemory, EMPTY_TILT_MEMORY, start, drag(40, 0), ctx).pose;
      expect(right.azimuthRad).toBeCloseTo(AZ - 40 * perPx, 12);
      expect(right.altitudeRad).toBe(0);
      const down = ROW.step(ROW.emptyMemory, EMPTY_TILT_MEMORY, start, drag(0, 40), ctx).pose;
      expect(down.altitudeRad).toBeCloseTo(40 * perPx, 12);
      expect(down.azimuthRad).toBe(AZ);
      // A right-drag (pan) looks exactly as a left-drag does.
      expect(
        ROW.step(ROW.emptyMemory, EMPTY_TILT_MEMORY, start, drag(40, 40, 'pan'), ctx).pose,
      ).toEqual(ROW.step(ROW.emptyMemory, EMPTY_TILT_MEMORY, start, drag(40, 40), ctx).pose);
    }
    // The point of the sky under the pointer stays under it: a sign flip moves it
    // twice the drag the wrong way, while the linear gain law is off only to
    // second order in the drag's angle.
    const ctx = withLens(degToRad(60));
    const centre = ctx.viewportPx[1] / 2;
    const f = centre / Math.tan(ctx.fovYRad / 2);
    const start = framed(AZ, 0);
    const p0: Vec2 = [52, 48];
    const d: Vec2 = [20, 12];
    const before = ROW.toParent(start, ctx).pose.basisLocal;
    const after = ROW.toParent(
      {
        frame: FRAME,
        pose: ROW.step(
          ROW.emptyMemory,
          EMPTY_TILT_MEMORY,
          start,
          drag(d[0], d[1], 'orbit', p0),
          ctx,
        ).pose,
      },
      ctx,
    ).pose.basisLocal;
    const landed = pixelOf(after, rayAt(before, p0, f, centre), f, centre);
    const tolerancePx = 0.15 * Math.hypot(d[0], d[1]);
    expect(Math.abs(landed[0] - (p0[0] + d[0]))).toBeLessThan(tolerancePx);
    expect(Math.abs(landed[1] - (p0[1] + d[1]))).toBeLessThan(tolerancePx);
  });

  it('altitude clamps at ±90° and azimuth stays free at the zenith', () => {
    const ctx = withLens(degToRad(60));
    const up = ROW.step(
      ROW.emptyMemory,
      EMPTY_TILT_MEMORY,
      framed(AZ, 0.3),
      drag(0, 1e4),
      ctx,
    ).pose;
    expect(up.altitudeRad).toBe(Math.PI / 2);
    const turned = ROW.step(
      ROW.emptyMemory,
      EMPTY_TILT_MEMORY,
      framed(up.azimuthRad, up.altitudeRad),
      drag(30, 0),
      ctx,
    );
    expect(turned.pose.azimuthRad).not.toBe(up.azimuthRad);
    expect(turned.pose.altitudeRad).toBe(Math.PI / 2);
    const down = ROW.step(
      ROW.emptyMemory,
      EMPTY_TILT_MEMORY,
      framed(AZ, 0.3),
      drag(0, -1e4),
      ctx,
    ).pose;
    expect(down.altitudeRad).toBe(-Math.PI / 2);
  });

  it('wheel scales the lens multiplicatively inside [LENS_MIN_DEG, LENS_MAX_DEG]', () => {
    const start = framed(AZ, 0.3);
    const wider = ROW.step(
      ROW.emptyMemory,
      EMPTY_TILT_MEMORY,
      start,
      wheel(1.25),
      withLens(degToRad(60)),
    );
    expect(wider.pose).toBe(start.pose);
    expect(wider.fovYRad).toBeCloseTo(degToRad(75), 12);
    const settle = (factor: number): number => {
      let lens = degToRad(60);
      for (let i = 0; i < 40; i++) {
        lens =
          ROW.step(ROW.emptyMemory, EMPTY_TILT_MEMORY, start, wheel(factor), withLens(lens))
            .fovYRad ?? lens;
      }
      return lens;
    };
    expect(settle(2)).toBe(degToRad(LENS_MAX_DEG));
    expect(settle(0.5)).toBe(degToRad(LENS_MIN_DEG));
  });

  it('a notch the lens clamp eats whole is declined by reference', () => {
    const start = framed(AZ, 0.3);
    const out = ROW.step(
      ROW.emptyMemory,
      EMPTY_TILT_MEMORY,
      start,
      wheel(0.8),
      withLens(degToRad(LENS_MIN_DEG)),
    );
    expect(out.pose).toBe(start.pose);
    expect(out.fovYRad).toBeUndefined();
    expect(out.pushed).toBeUndefined();
    const edge = ROW.step(
      ROW.emptyMemory,
      EMPTY_TILT_MEMORY,
      start,
      { kind: 'gestureEnd' },
      withLens(1),
    );
    expect(edge.pose).toBe(start.pose);
    expect(edge.fovYRad).toBeUndefined();
  });

  it("nudge look and zoom move the view and the lens at the drag's rate", () => {
    const ctx = withLens(degToRad(60));
    const start = framed(AZ, 0.3);
    const look: Vec2 = [0.1, 0.05];
    const pxPerRad = ctx.viewportPx[1] / ctx.fovYRad;
    const nudged = ROW.nudge(EMPTY_TILT_MEMORY, start, { look, zoom: Math.log(1.25) }, ctx);
    const dragged = ROW.step(
      ROW.emptyMemory,
      EMPTY_TILT_MEMORY,
      start,
      drag(look[0] * pxPerRad, look[1] * pxPerRad),
      ctx,
    );
    expect(nudged.pose.azimuthRad).toBeCloseTo(dragged.pose.azimuthRad, 12);
    expect(nudged.pose.altitudeRad).toBeCloseTo(dragged.pose.altitudeRad, 12);
    expect(nudged.fovYRad).toBeCloseTo(degToRad(75), 12);
    // The sky arm has no orbit and no roll: those axes leave everything by reference.
    const ignored = ROW.nudge(EMPTY_TILT_MEMORY, start, { orbit: [0.1, 0.1], roll: 0.2 }, ctx);
    expect(ignored.pose).toBe(start.pose);
    expect(ignored.fovYRad).toBeUndefined();
  });

  it('release is true once the focus leaves the host', () => {
    const start = framed(AZ, 0.3);
    expect(ROW.release(start, ctxFor(null))).toBe(false);
    expect(ROW.release(start, ctxFor(EARTH))).toBe(false);
    expect(ROW.release(start, ctxFor(asSceneBodyId('mars')))).toBe(true);
    // A galaxy: no body id, yet a focus off the host all the same.
    expect(ROW.release(start, { ...ctxFor(null), bodilessFocus: true })).toBe(true);
  });
});

describe('the sky exit lift', () => {
  const LENS_MAX = degToRad(LENS_MAX_DEG);
  const start = framed(AZ, 0.3);
  const atMax = withLens(LENS_MAX);

  it('wheel-out at the widest lens starts the lift; the notch that reaches it only widens', () => {
    const reaching = ROW.step(
      ROW.emptyMemory,
      EMPTY_TILT_MEMORY,
      start,
      wheel(1.1),
      withLens(degToRad(119)),
    );
    expect(reaching.fovYRad).toBe(LENS_MAX);
    expect(reaching.pushed).toBeUndefined();
    const out = ROW.step(reaching.memory, EMPTY_TILT_MEMORY, start, wheel(1.1), atMax);
    expect(out.pose).toBe(start.pose);
    expect(out.fovYRad).toBeUndefined();
    expect(out.pushed?.edge).toBe('out');
  });

  it('a wheel-out tail at the widest lens stays; only a fresh notch lifts', () => {
    const notch = (fresh: boolean) =>
      ROW.step(ROW.emptyMemory, EMPTY_TILT_MEMORY, start, wheel(1.1, fresh), atMax).pushed;
    expect(notch(false)).toBeUndefined();
    expect(notch(true)?.edge).toBe('out');
  });

  // −430 m is the Dead Sea: an eye standing there is inside the datum sphere.
  it.each([TERRAIN_M, -430])(
    'the exit lift ends above the spot looking down at the default lens — terrain %d m',
    (terrainM) => {
      const ctx = withLens(LENS_MAX, terrainM);
      const pushed = ROW.step(ROW.emptyMemory, EMPTY_TILT_MEMORY, start, wheel(1.1), ctx).pushed;
      if (pushed?.edge !== 'out') throw new Error('expected the sky exit push');
      const { lift } = pushed;
      const at = (sec: number) =>
        evaluateFramedClip(lift, sec, {
          bodies: ctx.bodies,
          frameBasis: B,
          playback: {},
          terrainHeightAt: ctx.terrainHeightAt,
        });
      // The lift opens on the standing view, not its mirror below the horizon.
      expect(at(0).channels.pitch).toBeCloseTo(start.pose.altitudeRad, 6);
      const end = at((SKY_EXIT_PITCH_MS + SKY_EXIT_CLIMB_MS) / 1000);
      expect(end.frame).toEqual({ body: EARTH });
      expect(end.channels.fov).toBeCloseTo(DEFAULT_FOV_Y_RAD, 12);
      const arm = decodeBodyFixedChannels(end.channels, EARTH);
      const eye = bodyFixedEyeM(arm);
      const up = radialOf(FRAME.sky);
      const ground = R_EARTH_M + terrainM;
      const along = eye[0] * up[0] + eye[1] * up[1] + eye[2] * up[2];
      expect(Math.abs(along - ground - SKY_EXIT_ALTITUDE_M) / SKY_EXIT_ALTITUDE_M).toBeLessThan(
        1e-6,
      );
      // On the radial: no horizontal offset beyond the same tolerance.
      const off = Math.hypot(
        eye[0] - along * up[0],
        eye[1] - along * up[1],
        eye[2] - along * up[2],
      );
      expect(off / SKY_EXIT_ALTITUDE_M).toBeLessThan(1e-6);
      const m = arm.basisLocal;
      for (let i = 0; i < 3; i++) expect(m[6 + i]).toBeCloseTo(-up[i]!, 7);
      // The map's heading is the sky azimuth: screen-up is the standing basis's horizontal
      // forward, to the precision of the leg's crossing through world Mpc.
      const standing = ROW.toParent(framed(AZ, 0), ctx).pose.basisLocal;
      for (let i = 0; i < 3; i++) expect(m[3 + i]).toBeCloseTo(standing[6 + i]!, 6);
    },
  );
});
