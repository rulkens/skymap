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
import { PITCH_LIMIT } from '../../../src/utils/camera/pitchLimit';
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
    const pxMoved = Math.hypot(120, 80);

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
      pxMoved,
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
      Math.hypot(dxCss, dyCss),
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
      Math.hypot(dxCss, dyCss),
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
      dxCss,
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
      dxCss,
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
      Math.hypot(50, 40),
    );

    expect(solved).toBeNull();
  });
});

describe('surfaceDragRotation — the trust bound on an accepted root (FW-D)', () => {
  // The user's captured re-gate pose, verbatim from the debug-panel JSON: Earth
  // focused, eye 21,216 km up (3.33 body radii), pitch 51°. `followPanOffset`
  // and the zoom lateral were both exactly zero in that capture, which is what
  // isolates the jump to this solve. Magnitudes are the real RTC ones — a body
  // 1e-16 Mpc across sitting 4e-12 Mpc from the origin — so the assertions stay
  // relative.
  const R_MPC = 2.0647004853050049e-16;
  const DISTANCE_MPC = 8.940415357400966e-16;
  const YAW = -2.784197202741855;
  const PITCH = 0.8821305565021093;
  const CENTRE_MPC: Vec3 = [
    4.185434713106926e-12, -2.3450604345518434e-12, -1.0165741690099294e-12,
  ];
  const CAPTURE_CANVAS = { width: 1512, height: 858 };
  const CAPTURE_ASPECT = CAPTURE_CANVAS.width / CAPTURE_CANVAS.height;
  const CAPTURE_FOV = (Math.PI / 180) * 60;

  function captureCam(): OrbitCamera {
    return createOrbitCamera({
      target: [CENTRE_MPC[0], CENTRE_MPC[1], CENTRE_MPC[2]],
      distance: DISTANCE_MPC,
      yaw: YAW,
      pitch: PITCH,
      fovYRad: CAPTURE_FOV,
      aspect: CAPTURE_ASPECT,
      near: 1e-18,
      far: 1,
    });
  }

  function captureGrabAt(cam: OrbitCamera, cssPos: { x: number; y: number }): LonLatDeg | null {
    const ray = cursorRayWorld(
      cssPos,
      CAPTURE_CANVAS,
      cam.position,
      forwardOf(cam),
      ROLL,
      UP_REF,
      CAPTURE_FOV,
      CAPTURE_ASPECT,
    );
    return cursorSurfaceHit(ray, CENTRE_MPC, R_MPC, IDENTITY_MAT3);
  }

  function solveAt(
    cam: OrbitCamera,
    grab: LonLatDeg,
    cursorCss: { x: number; y: number },
    pxMoved: number,
  ) {
    return surfaceDragRotation(
      grab,
      IDENTITY_MAT3,
      CENTRE_MPC,
      R_MPC,
      cam,
      ROLL,
      UP_REF,
      CAPTURE_FOV,
      CAPTURE_ASPECT,
      CAPTURE_CANVAS,
      cursorCss,
      pxMoved,
    );
  }

  // Deliberately LOOSER than the module's own multiple: this pins the contract
  // (a few-pixel drag never lurches) rather than restating `MAX_SOLVE_RATE_MULT`,
  // so raising that constant a notch doesn't fail the suite while a return to
  // an unbounded accept still does, by four orders of magnitude.
  const generousStepFor = (pxMoved: number): number =>
    10 *
    orbitRadPerPixel(CAPTURE_FOV, DISTANCE_MPC - R_MPC, CAPTURE_CANVAS.height, R_MPC) *
    Math.max(pxMoved, 1);

  it('declines the far root a 2 px drag near the captured limb converges onto', () => {
    // Grab pixel (580, 420) sits on the visible limb at this pose (the disc is
    // 176 px across, centred at (756, 429)). Before the bound, this exact
    // 2 px drag was accepted with Δyaw +204.03 rad and Δpitch −588.94 rad —
    // 32 turns of yaw, and a pitch the caller then CLAMPED to the limit, which
    // is how the capture ended up parked at 81° with a nonsense yaw.
    const cam = captureCam();
    const grab = captureGrabAt(cam, { x: 580, y: 420 });
    expect(grab).not.toBeNull();

    const solved = solveAt(cam, grab!, { x: 582, y: 422 }, Math.hypot(2, 2));

    expect(solved).toBeNull();
  });

  it('every accepted root across the captured disc is on-branch, inside the pitch limit, and small', () => {
    // The sweep the single case above is one pixel of: 3 px steps across the
    // whole canvas, four drag directions. Unbounded, this sample accepted 33
    // roots at ≥100x the flat rate and a worst |Δyaw| of 431 rad (68.7 turns),
    // and 43 roots past PITCH_LIMIT — each of which the caller clamped and
    // accepted anyway.
    const cam = captureCam();
    let accepted = 0;
    for (let gx = 2; gx < CAPTURE_CANVAS.width; gx += 3) {
      for (let gy = 2; gy < CAPTURE_CANVAS.height; gy += 3) {
        const grab = captureGrabAt(cam, { x: gx, y: gy });
        if (grab === null) continue;
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [-2, -1],
          [3, 2],
        ]) {
          const pxMoved = Math.hypot(dx!, dy!);
          const solved = solveAt(cam, grab, { x: gx + dx!, y: gy + dy! }, pxMoved);
          if (solved === null) continue;
          accepted++;
          expect(Math.abs(solved.pitch)).toBeLessThan(PITCH_LIMIT);
          expect(Math.abs(solved.yaw - cam.yaw)).toBeLessThanOrEqual(Math.PI);
          expect(Math.hypot(solved.yaw - cam.yaw, solved.pitch - cam.pitch)).toBeLessThanOrEqual(
            generousStepFor(pxMoved),
          );
        }
      }
    }
    // The bound must not have emptied the hit branch: most of the disc still
    // solves exactly at this pose.
    expect(accepted).toBeGreaterThan(5000);
  });

  it('still tracks the grabbed point exactly for a well-conditioned drag at these magnitudes', () => {
    // The floor the bound must not cost us: a centre-of-disc grab, a 4 px drag,
    // real RTC magnitudes. Verified by rebuilding the cursor ray independently
    // (`cursorRayWorld` + `raySphereRoots`) from the post-drag pose.
    const cam = captureCam();
    const grabCss = { x: 756, y: 429 };
    const grab = captureGrabAt(cam, grabCss);
    expect(grab).not.toBeNull();

    const cursorCss = { x: grabCss.x + 3, y: grabCss.y - 2 };
    const solved = solveAt(cam, grab!, cursorCss, Math.hypot(3, 2));
    expect(solved).not.toBeNull();

    const dragged = captureCam();
    dragged.yaw = solved!.yaw;
    dragged.pitch = solved!.pitch;
    updatePosition(dragged);

    const ray = cursorRayWorld(
      cursorCss,
      CAPTURE_CANVAS,
      dragged.position,
      forwardOf(dragged),
      ROLL,
      UP_REF,
      CAPTURE_FOV,
      CAPTURE_ASPECT,
    );
    const roots = raySphereRoots(ray.origin, ray.direction, CENTRE_MPC, R_MPC);
    expect(roots).not.toBeNull();
    const dir = lonLatDegToDirection(grab!);
    const grabbedWorld: Vec3 = [
      CENTRE_MPC[0] + dir[0] * R_MPC,
      CENTRE_MPC[1] + dir[1] * R_MPC,
      CENTRE_MPC[2] + dir[2] * R_MPC,
    ];
    const err = Math.hypot(
      ray.origin[0] + roots![0] * ray.direction[0] - grabbedWorld[0],
      ray.origin[1] + roots![0] * ray.direction[1] - grabbedWorld[1],
      ray.origin[2] + roots![0] * ray.direction[2] - grabbedWorld[2],
    );
    expect(err).toBeLessThan(1e-3 * R_MPC);
  });
});
