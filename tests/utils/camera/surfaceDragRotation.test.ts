/**
 * surfaceDragRotation tests — cursor-anchored orbit-drag (spec §4.4).
 *
 * The round-trip test is the CONTRACT: apply the returned (yaw, pitch),
 * rebuild the cursor ray independently via `cursorRayWorld` + `raySphereRoots`
 * (never the module's own `projectCss`), and check it lands back on the
 * grabbed point — an INDEPENDENT check of the stated goal, not a mirror of
 * whichever internal method (Newton on the exact projection) the
 * implementation uses. The centre-agreement and off-centre-divergence tests
 * cross-check against `orbitRadPerPixel`, an independently-derived formula
 * that is documented exact only at screen centre.
 */

import { describe, it, expect } from 'vitest';
import { surfaceDragRotation } from '../../../src/utils/camera/surfaceDragRotation';
import { cursorRayWorld } from '../../../src/utils/camera/cursorRayWorld';
import { cursorSurfaceHit } from '../../../src/utils/camera/cursorSurfaceHit';
import { raySphereRoots } from '../../../src/utils/math/raySphereRoots';
import { lonLatDegToDirection } from '../../../src/utils/scene/lonLatDegToDirection';
import { updatePosition } from '../../../src/utils/camera/updatePosition';
import { orbitRadPerPixel } from '../../../src/utils/camera/orbitRadPerPixel';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';
import type { LonLatDeg } from '../../../src/@types/scene/LonLatDeg';

const CANVAS = { width: 800, height: 600 };
const FOV_Y_RAD = Math.PI / 3; // 60°
const ASPECT = CANVAS.width / CANVAS.height;
const BODY_CENTRE: Vec3 = [0, 0, 0];
// No frame-roll active in most cases here: roll = 0, screen-up = world +Y —
// the identity-`upBasis` values a caller with no orientation frame passes.
const ROLL = 0;
const UP_REF: Vec3 = [0, 1, 0];

function makeCam(distance: number): OrbitCamera {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance,
    yaw: 0,
    pitch: 0,
    fovYRad: FOV_Y_RAD,
    aspect: ASPECT,
    near: 0.01,
    far: 1000,
  });
}

function normalize(v: Vec3): Vec3 {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

function forwardOf(cam: OrbitCamera): Vec3 {
  return normalize([
    cam.target[0] - cam.position[0],
    cam.target[1] - cam.position[1],
    cam.target[2] - cam.position[2],
  ]);
}

/** The camera-eye ray toward `cssPos`, at a given `roll`/`upRef` — the same
 * pair `wireInput.ts` feeds `cursorRayWorld` (`cam.roll ?? 0`,
 * `frameUp(cam.upBasis)`) and now `surfaceDragRotation` takes directly. */
function rayAtCss(
  cam: OrbitCamera,
  cssPos: { x: number; y: number },
  roll: number = ROLL,
  upRef: Vec3 = UP_REF,
) {
  return cursorRayWorld(
    cssPos,
    CANVAS,
    cam.position,
    forwardOf(cam),
    roll,
    upRef,
    FOV_Y_RAD,
    ASPECT,
  );
}

/** The body-local lon/lat whose world point projects to exactly `cssPos` for
 * `cam` — built from `cursorRayWorld` + `cursorSurfaceHit`, independent of
 * `surfaceDragRotation`'s own projection math, so it is a fixture, not a mirror. */
function grabAtCss(
  cam: OrbitCamera,
  cssPos: { x: number; y: number },
  radiusMpc: number,
  roll: number = ROLL,
  upRef: Vec3 = UP_REF,
): LonLatDeg {
  const point = cursorSurfaceHit(
    rayAtCss(cam, cssPos, roll, upRef),
    BODY_CENTRE,
    radiusMpc,
    IDENTITY_MAT3,
  );
  if (point === null) throw new Error('test fixture: ray misses the sphere');
  return point;
}

function worldPointOf(point: LonLatDeg, radiusMpc: number): Vec3 {
  const dir = lonLatDegToDirection(point);
  return [dir[0] * radiusMpc, dir[1] * radiusMpc, dir[2] * radiusMpc];
}

describe('surfaceDragRotation', () => {
  it('reprojects the grabbed point back to the cursor (round-trip)', () => {
    const RADIUS_MPC = 10;
    // distance = 1.5 * radius keeps the body's visible disc large (angular
    // radius asin(10/15) ≈ 42°) so a 120/80 px drag still lands on the sphere —
    // at deep-space distances the disc is a few degrees wide and any sizeable
    // drag overshoots it (a geometric fact, not a bug: with `target`/`distance`
    // fixed the camera always looks straight at the body's centre, so the disc
    // never grows or shrinks as the camera orbits).
    const cam = makeCam(15);
    const grabbedPoint = grabAtCss(cam, { x: 400, y: 300 }, RADIUS_MPC); // nadir, screen centre

    const cursorCss = { x: 520, y: 220 }; // hand-picked drag: +120 / -80 px

    const solved = surfaceDragRotation(
      grabbedPoint,
      IDENTITY_MAT3,
      BODY_CENTRE,
      RADIUS_MPC,
      cam,
      ROLL,
      UP_REF,
      FOV_Y_RAD,
      ASPECT,
      CANVAS,
      cursorCss,
    );
    expect(solved).not.toBeNull();
    const { yaw, pitch } = solved!;

    const draggedCam = makeCam(15);
    draggedCam.yaw = yaw;
    draggedCam.pitch = pitch;
    updatePosition(draggedCam);

    const ray = rayAtCss(draggedCam, cursorCss);
    const roots = raySphereRoots(ray.origin, ray.direction, BODY_CENTRE, RADIUS_MPC);
    expect(roots).not.toBeNull();
    const tNear = roots![0];
    const hit: Vec3 = [
      ray.origin[0] + tNear * ray.direction[0],
      ray.origin[1] + tNear * ray.direction[1],
      ray.origin[2] + tNear * ray.direction[2],
    ];

    const grabbedWorld = worldPointOf(grabbedPoint, RADIUS_MPC);
    const err = Math.hypot(
      hit[0] - grabbedWorld[0],
      hit[1] - grabbedWorld[1],
      hit[2] - grabbedWorld[2],
    );
    expect(err).toBeLessThan(1e-4 * RADIUS_MPC);
  });

  it('at screen centre with a nadir grab, a small drag matches orbitRadPerPixel’s rate', () => {
    const RADIUS_MPC = 10;
    const distance = 15; // h = 5 Mpc altitude — well inside the ground-tracking regime
    const cam = makeCam(distance);
    const grabbedPoint = grabAtCss(cam, { x: CANVAS.width / 2, y: CANVAS.height / 2 }, RADIUS_MPC);

    const dxCss = 2;
    const dyCss = 1.5;
    const cursorCss = { x: CANVAS.width / 2 + dxCss, y: CANVAS.height / 2 + dyCss };

    const solved = surfaceDragRotation(
      grabbedPoint,
      IDENTITY_MAT3,
      BODY_CENTRE,
      RADIUS_MPC,
      cam,
      ROLL,
      UP_REF,
      FOV_Y_RAD,
      ASPECT,
      CANVAS,
      cursorCss,
    );
    expect(solved).not.toBeNull();
    const { yaw, pitch } = solved!;

    const radPerPixel = orbitRadPerPixel(
      FOV_Y_RAD,
      distance - RADIUS_MPC,
      CANVAS.height,
      RADIUS_MPC,
    );
    // Same sign convention orbitControls.ts's flat-rate lines use: yaw -= dx*rate, pitch += dy*rate.
    const expectedDYaw = -dxCss * radPerPixel;
    const expectedDPitch = dyCss * radPerPixel;

    const actualDYaw = yaw - cam.yaw;
    const actualDPitch = pitch - cam.pitch;

    expect(Math.abs(actualDYaw - expectedDYaw)).toBeLessThan(0.05 * Math.abs(expectedDYaw));
    expect(Math.abs(actualDPitch - expectedDPitch)).toBeLessThan(0.05 * Math.abs(expectedDPitch));
  });

  it('off-centre near the visible limb, the same-shape drag diverges from the flat-rate prediction', () => {
    // Regression test for the bug the exact fix exists to close: orbitRadPerPixel
    // is only documented correct AT screen centre — its isotropic rate assumes
    // every screen pixel needs the same rotation, which perspective foreshortening
    // makes false near the limb.
    const RADIUS_MPC = 10;
    const distance = 15;
    const cam = makeCam(distance);
    const grabbedPoint = grabAtCss(cam, { x: 750, y: 300 }, RADIUS_MPC); // near the limb, far off centre (400, 300)

    const dxCss = 40;
    const dyCss = 30;
    const cursorCss = { x: 750 + dxCss, y: 300 + dyCss };

    const solved = surfaceDragRotation(
      grabbedPoint,
      IDENTITY_MAT3,
      BODY_CENTRE,
      RADIUS_MPC,
      cam,
      ROLL,
      UP_REF,
      FOV_Y_RAD,
      ASPECT,
      CANVAS,
      cursorCss,
    );
    expect(solved).not.toBeNull();
    const { yaw, pitch } = solved!;

    const radPerPixel = orbitRadPerPixel(
      FOV_Y_RAD,
      distance - RADIUS_MPC,
      CANVAS.height,
      RADIUS_MPC,
    );
    const expectedDYaw = -dxCss * radPerPixel;
    const expectedDPitch = dyCss * radPerPixel;

    const actualDYaw = yaw - cam.yaw;
    const actualDPitch = pitch - cam.pitch;

    // Well outside the centre case's few-percent agreement band on at least one axis.
    const yawOff = Math.abs((actualDYaw - expectedDYaw) / expectedDYaw);
    const pitchOff = Math.abs((actualDPitch - expectedDPitch) / expectedDPitch);
    expect(Math.max(yawOff, pitchOff)).toBeGreaterThan(0.2);
  });

  it('a 90° roll swaps which screen axis drives yaw vs pitch', () => {
    // The screen basis is `roll`/`upRef`-dependent (finding: it must match the
    // ACTUALLY-rendered basis, not a hardcoded roll=0/poseBasis-derived up —
    // see the module header). A 90° roll rotates the screen axes a quarter
    // turn, so a purely-horizontal cursor delta that drove pure YAW at
    // roll=0 must drive (up to sign) the SAME-MAGNITUDE pure PITCH change at
    // roll=90°, and vice versa — a hand-checkable consequence of rotating the
    // screen plane, not a mirror of the implementation's own formula.
    const RADIUS_MPC = 10;
    const distance = 15;
    const cam = makeCam(distance);
    const dxCss = 2;
    const cursorCss = { x: CANVAS.width / 2 + dxCss, y: CANVAS.height / 2 };

    // A screen-CENTRE grab is roll-independent: `cursorRayWorld`'s ndcX/ndcY
    // are both 0 there, so `sx = sy = 0` and its ray direction collapses to
    // `forward` regardless of roll — one grabbed point serves both trials.
    const grabbedPoint = grabAtCss(cam, { x: CANVAS.width / 2, y: CANVAS.height / 2 }, RADIUS_MPC);

    const noRoll = surfaceDragRotation(
      grabbedPoint,
      IDENTITY_MAT3,
      BODY_CENTRE,
      RADIUS_MPC,
      cam,
      0,
      UP_REF,
      FOV_Y_RAD,
      ASPECT,
      CANVAS,
      cursorCss,
    );
    expect(noRoll).not.toBeNull();

    const rolled = surfaceDragRotation(
      grabbedPoint,
      IDENTITY_MAT3,
      BODY_CENTRE,
      RADIUS_MPC,
      cam,
      Math.PI / 2,
      UP_REF,
      FOV_Y_RAD,
      ASPECT,
      CANVAS,
      cursorCss,
    );
    expect(rolled).not.toBeNull();

    const noRollDYaw = noRoll!.yaw - cam.yaw;
    const noRollDPitch = noRoll!.pitch - cam.pitch;
    const rolledDYaw = rolled!.yaw - cam.yaw;
    const rolledDPitch = rolled!.pitch - cam.pitch;

    // roll = 0: the horizontal drag is almost entirely yaw.
    expect(Math.abs(noRollDYaw)).toBeGreaterThan(1e-4);
    expect(Math.abs(noRollDPitch)).toBeLessThan(1e-9);

    // roll = 90°: the SAME horizontal drag is almost entirely pitch instead,
    // at the same magnitude the roll=0 case put into yaw.
    expect(Math.abs(rolledDPitch)).toBeCloseTo(Math.abs(noRollDYaw), 6);
    expect(Math.abs(rolledDYaw)).toBeLessThan(1e-9);
  });

  it('a degenerate configuration (grabbed point pinned to screen centre for every pose) returns null', () => {
    // radiusMpc = 0 makes the grabbed point's world position equal
    // `bodyCentreMpc` (= `cam.target`) exactly — the target projects to
    // screen centre for EVERY (yaw, pitch) (the camera always looks straight
    // at its target), so the screen-space Jacobian is exactly rank-deficient
    // (both columns are the zero vector) — a hand-verifiable det = 0, not an
    // incidental floating-point near-singularity. An off-centre cursor is
    // then geometrically unreachable: no rotation moves a point that's
    // pinned to centre.
    const cam = makeCam(15);
    const grabbedPoint: LonLatDeg = { lonDeg: 0, latDeg: 45 };
    const cursorCss = { x: CANVAS.width / 2 + 50, y: CANVAS.height / 2 + 40 };

    const solved = surfaceDragRotation(
      grabbedPoint,
      IDENTITY_MAT3,
      BODY_CENTRE,
      0,
      cam,
      ROLL,
      UP_REF,
      FOV_Y_RAD,
      ASPECT,
      CANVAS,
      cursorCss,
    );

    expect(solved).toBeNull();
  });
});
