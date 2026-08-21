/**
 * cursorZoomStep — classic zoom-to-cursor (spec §4.2, redesigned 2026-08-21).
 *
 * The contract test is the STATED GOAL, checked independently: after applying
 * the step, a ray cast at the SAME cursor pixel from the resulting camera still
 * passes through the surface point that was under the cursor before the tick.
 * The ray is rebuilt with `cursorRayWorld` + `raySphereRoots` directly, never
 * through the module's own anchor pick, so it is a check and not a mirror — and
 * the same assertion is run against a plain centred zoom (the mechanism this
 * replaces) to show it genuinely FAILS there.
 *
 * The pose is the user's captured gate pose over Earth: 21,216 km altitude,
 * eye 8.94e-16 Mpc from the centre. At that magnitude every assertion has to be
 * relative — sub-tolerance fixtures pass on anything.
 */

import { describe, it, expect } from 'vitest';

import { cursorZoomStep } from '../../../src/utils/camera/cursorZoomStep';
import { zoomedPose } from '../../../src/utils/camera/zoomedPose';
import { cursorRayWorld } from '../../../src/utils/camera/cursorRayWorld';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { updatePosition } from '../../../src/utils/camera/updatePosition';
import { raySphereRoots } from '../../../src/utils/math/raySphereRoots';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/surfaceStandoffRadii';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { ZoomStep } from '../../../src/@types/camera/ZoomStep';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';

const CANVAS = { width: 800, height: 600 };
const FOV_Y_RAD = Math.PI / 3;
const R = 6371 * SCALE_UNITS.KM_TO_MPC;
const ALT = 21216 * SCALE_UNITS.KM_TO_MPC;
const CENTRE: Vec3 = [0, 0, 0];
const PIVOT = { centreMpc: CENTRE, radiusMpc: R };
/**
 * Off-centre, but well inside the globe's silhouette: at this altitude the
 * globe's angular radius is asin(R / (R + ALT)) ≈ 13.4°, i.e. ~133 px of the
 * 600 px-tall frame, around the centre at (400, 300).
 */
const CURSOR = { x: 470, y: 250 };

function makeCam(distance = R + ALT): OrbitCamera {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance,
    yaw: 0,
    pitch: 0,
    fovYRad: FOV_Y_RAD,
    aspect: CANVAS.width / CANVAS.height,
    near: 1e-20,
    far: 1e-12,
  });
}

function forwardOf(cam: OrbitCamera): Vec3 {
  const fx = cam.target[0] - cam.position[0];
  const fy = cam.target[1] - cam.position[1];
  const fz = cam.target[2] - cam.position[2];
  const len = Math.hypot(fx, fy, fz);
  return [fx / len, fy / len, fz / len];
}

/** Independent cursor→surface pick: the point the user is pointing at. */
function surfaceUnderCursor(cam: OrbitCamera, cursor: { x: number; y: number }): Vec3 | null {
  const ray = cursorRayWorld(
    cursor,
    CANVAS,
    cam.position,
    forwardOf(cam),
    0,
    [0, 1, 0],
    cam.fovYRad,
    cam.aspect,
  );
  const roots = raySphereRoots(ray.origin, ray.direction, CENTRE, R);
  if (roots === null || roots[0] < 0) return null;
  return [
    ray.origin[0] + roots[0] * ray.direction[0],
    ray.origin[1] + roots[0] * ray.direction[1],
    ray.origin[2] + roots[0] * ray.direction[2],
  ];
}

/** Perpendicular distance from `point` to the ray cast at `cursor`, ÷ |point|. */
function relativeRayMiss(cam: OrbitCamera, cursor: { x: number; y: number }, point: Vec3): number {
  const ray = cursorRayWorld(
    cursor,
    CANVAS,
    cam.position,
    forwardOf(cam),
    0,
    [0, 1, 0],
    cam.fovYRad,
    cam.aspect,
  );
  const vx = point[0] - ray.origin[0];
  const vy = point[1] - ray.origin[1];
  const vz = point[2] - ray.origin[2];
  const along = vx * ray.direction[0] + vy * ray.direction[1] + vz * ray.direction[2];
  return (
    Math.hypot(
      vx - along * ray.direction[0],
      vy - along * ray.direction[1],
      vz - along * ray.direction[2],
    ) / Math.hypot(point[0], point[1], point[2])
  );
}

/** The camera the step produces: target strafes, distance scales, angles hold. */
function applyStep(cam: OrbitCamera, step: ZoomStep): OrbitCamera {
  const next: OrbitCamera = {
    ...cam,
    target: [
      cam.target[0] + step.lateralMpc[0],
      cam.target[1] + step.lateralMpc[1],
      cam.target[2] + step.lateralMpc[2],
    ],
    distance: cam.distance * step.distanceScale,
    position: [0, 0, 0],
  };
  updatePosition(next);
  return next;
}

describe('cursorZoomStep', () => {
  it('keeps the surface point under the cursor across a tick — and a centred zoom does not', () => {
    const cam = makeCam();
    const anchor = surfaceUnderCursor(cam, CURSOR);
    expect(anchor).not.toBeNull();

    const zoomed = applyStep(cam, cursorZoomStep(cam, CURSOR, CANVAS, PIVOT, 0.9));
    expect(relativeRayMiss(zoomed, CURSOR, anchor!)).toBeLessThan(1e-9);

    // The mechanism this replaces: distance scales, the pivot never moves. The
    // same anchor now sits far off the cursor ray — a whole percent of a body
    // radius, nine orders above the tolerance above.
    const centred = applyStep(cam, { distanceScale: 0.9, lateralMpc: [0, 0, 0] });
    expect(relativeRayMiss(centred, CURSOR, anchor!)).toBeGreaterThan(1e-2);
  });

  it('yaw and pitch are untouched — a zoom never re-aims the camera', () => {
    const cam = makeCam();
    const zoomed = applyStep(cam, cursorZoomStep(cam, CURSOR, CANVAS, PIVOT, 0.9));
    expect(zoomed.yaw).toBe(cam.yaw);
    expect(zoomed.pitch).toBe(cam.pitch);
  });

  it('a cursor MISS zooms centred: no lateral, altitude scaled by the factor', () => {
    // Cursor on the sky past the limb: the step is the centred altitude taper,
    // `distance = radius + altitude · factor`, exactly.
    const cam = makeCam();
    const offGlobe = { x: 4, y: 4 };
    expect(surfaceUnderCursor(cam, offGlobe)).toBeNull();

    const step = cursorZoomStep(cam, offGlobe, CANVAS, PIVOT, 0.9);
    expect(step.lateralMpc).toEqual([0, 0, 0]);
    expect((cam.distance * step.distanceScale) / (R + ALT * 0.9)).toBeCloseTo(1, 12);
  });

  it('stops the eye at the standoff floor when the tick overshoots the surface', () => {
    const cam = makeCam();
    const zoomed = applyStep(cam, cursorZoomStep(cam, CURSOR, CANVAS, PIVOT, 1e-9));
    const eyeRadius = Math.hypot(...zoomed.position);
    expect(eyeRadius / (R * SURFACE_STANDOFF_RADII)).toBeCloseTo(1, 9);
  });

  it('no focused surface → plain proportional distance scaling', () => {
    const cam = makeCam(100);
    const step = cursorZoomStep(cam, CURSOR, CANVAS, null, 1.2);
    expect(step.distanceScale).toBe(1.2);
    expect(step.lateralMpc).toEqual([0, 0, 0]);
  });
});

describe('cursorZoomStep — descent through the real apply path', () => {
  /** The camera a pose renders as, rebuilt each tick exactly as the frame does. */
  function camOf(pose: CameraPose): OrbitCamera {
    return createOrbitCamera({
      target: [pose.target[0], pose.target[1], pose.target[2]],
      distance: pose.distance,
      yaw: pose.yaw,
      pitch: pose.pitch,
      fovYRad: FOV_Y_RAD,
      aspect: CANVAS.width / CANVAS.height,
      near: 1e-20,
      far: 1e-12,
    });
  }

  it('an off-centre descent lands ON the standoff floor: not through it, not stalled above it', () => {
    // The loop is the whole point: step → `zoomedPose` (the REAL clamp) → pose →
    // step, at a cursor that keeps strafing the pivot off the body centre. Every
    // other floor test applies the step by hand and never reaches the clamp, which
    // is how a distance-currency floor here survived: it walls this descent
    // thousands of km up (~285 km at this cursor, and STICKY — once the distance
    // sits on `radius · STANDOFF` every further tick returns it unchanged), while
    // the missing "eye already inside the shell" arm let a tick at the tangent
    // case punch tens of km below the surface.
    let pose: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: R + ALT };
    // 135 ticks of 0.9 cover 21,216 km → 15 m; the rest prove the floor HOLDS.
    // Tracked per tick, not just at the end: a transient dip that a later tick
    // climbed back out of is still a frame rendered from inside the crust.
    let minAltitude = Infinity;
    for (let i = 0; i < 300; i++) {
      pose = zoomedPose(pose, cursorZoomStep(camOf(pose), CURSOR, CANVAS, PIVOT, 0.9));
      minAltitude = Math.min(minAltitude, Math.hypot(...camOf(pose).position) - R);
    }

    const standoffAltitude = R * (SURFACE_STANDOFF_RADII - 1);
    const altitude = Math.hypot(...camOf(pose).position) - R;
    expect(minAltitude / standoffAltitude).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(altitude / standoffAltitude).toBeCloseTo(1, 9);
  });
});
