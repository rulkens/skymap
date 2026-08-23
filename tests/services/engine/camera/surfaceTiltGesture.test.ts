/**
 * Shift+drag tilt PROBE, through the real gesture path: a sweep from nadir must
 * only ever go UP, must stop short of vertical, and must not spin the horizon
 * on its way — the user's "pretty buggy" report.
 *
 * delete when the globe-anchored camera pivot replaces surface navigation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { attachOrbitControls } from '../../../../src/services/camera/orbitControls';
import { createOrbitCamera } from '../../../../src/utils/camera/createOrbitCamera';
import { eyeAltitudeMpc } from '../../../../src/utils/camera/eyeAltitudeMpc';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const R = 6371 * SCALE_UNITS.KM_TO_MPC;
const CENTRE: Vec3 = [4.185434713106926e-12, -2.3450604345518434e-12, -1.0165741690099294e-12];
const W = 1512;
const H = 858;
const DEG = 180 / Math.PI;

type Listener = (e: unknown) => void;
function recorder() {
  const ls: Array<{ t: string; h: Listener }> = [];
  return {
    target: {
      addEventListener: (t: string, h: Listener) => void ls.push({ t, h }),
      removeEventListener: () => {},
    },
    fire: (t: string, e: unknown) => ls.filter((l) => l.t === t).forEach((l) => l.h(e)),
  };
}

let win: ReturnType<typeof recorder>;
let originalWindow: unknown;

beforeEach(() => {
  win = recorder();
  const g = globalThis as unknown as Record<string, unknown>;
  originalWindow = g.window;
  g.window = win.target;
});

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (originalWindow === undefined) delete g.window;
  else g.window = originalWindow;
});

const unit = (v: Vec3): Vec3 => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
};
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const aimOf = (cam: OrbitCamera): Vec3 =>
  unit([
    cam.target[0] - cam.position[0],
    cam.target[1] - cam.position[1],
    cam.target[2] - cam.position[2],
  ]);
/** Tilt away from nadir, in degrees: 0 straight down, 90 level, 180 straight up. */
const tiltDeg = (cam: OrbitCamera): number => {
  const zenith = unit([
    cam.position[0] - CENTRE[0],
    cam.position[1] - CENTRE[1],
    cam.position[2] - CENTRE[2],
  ]);
  return Math.acos(Math.max(-1, Math.min(1, -dot(aimOf(cam), zenith)))) * DEG;
};
/** The screen's up axis, as the renderer builds it. */
const screenUp = (cam: OrbitCamera): Vec3 =>
  imagePlaneBasis(aimOf(cam), cam.roll ?? 0, frameUp(cam.upBasis, [0, 0, 0]), {
    rolledUp: [0, 0, 0],
    right: [0, 0, 0],
    up: [0, 0, 0],
  }).up as Vec3;

/** Signed turn from `a` to `b` about `axis`, in degrees. */
function turnDeg(a: Vec3, b: Vec3, axis: Vec3): number {
  const flat = (v: Vec3): Vec3 => {
    const along = dot(v, axis);
    return unit([v[0] - axis[0] * along, v[1] - axis[1] * along, v[2] - axis[2] * along]);
  };
  const f = flat(a);
  const g = flat(b);
  const cross: Vec3 = [
    f[1] * g[2] - f[2] * g[1],
    f[2] * g[0] - f[0] * g[2],
    f[0] * g[1] - f[1] * g[0],
  ];
  return Math.atan2(dot(cross, axis), dot(f, g)) * DEG;
}

/**
 * Shift+drag `steps` events of (dxPx, dyPx) at `latDeg`, 100 km up, after
 * `preTiltPx` of pure upward drag to get off nadir.
 */
function shiftDrag(latDeg: number, dxPx: number, dyPx: number, steps: number, preTiltPx = 0) {
  const canvasRec = recorder();
  const canvas = Object.assign(canvasRec.target, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => false,
    clientWidth: W,
    clientHeight: H,
    width: W,
    height: H,
  });
  const cam = createOrbitCamera({
    target: [CENTRE[0], CENTRE[1], CENTRE[2]],
    distance: R + 100 * SCALE_UNITS.KM_TO_MPC,
    yaw: 0.4,
    pitch: latDeg / DEG,
    fovYRad: Math.PI / 3,
    aspect: W / H,
    near: 1e-18,
    far: 1,
  });
  const detach = attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, {
    pivotRadiusMpc: () => R,
    pivotAltitudeMpc: () => eyeAltitudeMpc(cam.position, CENTRE, R),
    hoveredSurfacePoint: () => null,
    dragPivotFrame: () => ({
      bodyId: 'earth' as never,
      bodyOrientation: [...IDENTITY_MAT3],
      bodyCentreMpc: CENTRE,
      radiusMpc: R,
      pinnedTargetMpc: null,
    }),
  });

  // `pointerdown` is bound to the canvas, the moves to `window`.
  canvasRec.fire('pointerdown', {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    shiftKey: true,
    clientX: W / 2,
    clientY: H / 2,
  });

  let x = W / 2;
  let y = H / 2;
  for (let i = 0; i < preTiltPx / 10; i++) {
    y -= 10;
    win.fire('pointermove', { pointerId: 1, clientX: x, clientY: y });
  }

  const eye0 = [...cam.position] as Vec3;
  const altitude0 = eyeAltitudeMpc(cam.position, CENTRE, R);
  let worstBackDeg = 0;
  let worstUpJumpDeg = 0;
  let headingDeg = 0;
  let leastHeadingStepDeg = Infinity;
  let prevTilt = tiltDeg(cam);
  let prevUp = screenUp(cam);
  let prevAim = aimOf(cam);
  for (let i = 0; i < steps; i++) {
    x += dxPx;
    y += dyPx;
    win.fire('pointermove', { pointerId: 1, clientX: x, clientY: y });
    const tilt = tiltDeg(cam);
    const up = screenUp(cam);
    const aim = aimOf(cam);
    const localUp = unit([
      cam.position[0] - CENTRE[0],
      cam.position[1] - CENTRE[1],
      cam.position[2] - CENTRE[2],
    ]);
    const step = turnDeg(prevAim, aim, localUp);
    headingDeg += step;
    leastHeadingStepDeg = Math.min(leastHeadingStepDeg, step);
    worstBackDeg = Math.max(worstBackDeg, prevTilt - tilt);
    worstUpJumpDeg = Math.max(
      worstUpJumpDeg,
      Math.acos(Math.max(-1, Math.min(1, dot(prevUp, up)))) * DEG,
    );
    prevTilt = tilt;
    prevUp = up;
    prevAim = aim;
  }
  detach();
  return {
    finalTiltDeg: prevTilt,
    worstBackDeg,
    worstUpJumpDeg,
    headingDeg,
    leastHeadingStepDeg,
    altitudeDriftKm:
      Math.abs(eyeAltitudeMpc(cam.position, CENTRE, R) - altitude0) / SCALE_UNITS.KM_TO_MPC,
    eyeDriftKm:
      Math.hypot(cam.position[0] - eye0[0], cam.position[1] - eye0[1], cam.position[2] - eye0[2]) /
      SCALE_UNITS.KM_TO_MPC,
  };
}

describe('shift+drag look probe', () => {
  it('only ever tilts up, stops short of vertical, and never spins the horizon', () => {
    for (const latDeg of [0, 20, 45, 80]) {
      const s = shiftDrag(latDeg, 0, -10, 140);
      const at = `frame latitude ${latDeg}`;
      // A drag far past the stop pins there: no fold back down, and no flip of
      // the screen basis (the aim crossing the frame pole reverses both).
      expect(s.worstBackDeg, at).toBeLessThan(0.01);
      expect(s.worstUpJumpDeg, at).toBeLessThan(10);
      expect(s.finalTiltDeg, at).toBeLessThan(180);
      // The tilt holds the eye — that is the whole mechanism.
      expect(s.eyeDriftKm, at).toBeLessThan(1e-6);
    }
  });

  it('turns the head on dx while tilting on dy, without moving the standpoint', () => {
    // Diagonal drag from a tilted view: 8 px right and 4 px up per event. The
    // heading axis is the eye's own local vertical, so it cannot touch altitude
    // — and 300 px of pre-tilt matters, because at exactly nadir the aim IS
    // that axis and there is no heading to turn (see the report).
    for (const latDeg of [20, 45]) {
      const s = shiftDrag(latDeg, 8, -4, 15, 300);
      const at = `frame latitude ${latDeg}`;
      // Monotone with dx: every event turns the same way, ~0.29°/px.
      expect(s.leastHeadingStepDeg, at).toBeGreaterThan(0);
      expect(s.headingDeg, at).toBeCloseTo(15 * 8 * 0.005 * DEG, 6);
      // And the vertical axis keeps its own promises through the diagonal.
      expect(s.worstBackDeg, at).toBeLessThan(0.01);
      expect(s.worstUpJumpDeg, at).toBeLessThan(10);
      expect(s.altitudeDriftKm, at).toBeLessThan(1e-6);
      expect(s.eyeDriftKm, at).toBeLessThan(1e-6);
    }
  });
});
