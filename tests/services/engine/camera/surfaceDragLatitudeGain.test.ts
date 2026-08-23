/**
 * Drag-trace: does the grabbed ground point stay under the cursor?
 *
 * Drives the REAL `attachOrbitControls` gesture path (pointerdown → N
 * pointermoves) at Earth's real RTC magnitudes, with the grab at screen
 * centre and the camera parked over a sweep of latitudes. After the gesture
 * the cursor ray is rebuilt independently (`cursorRayWorld` +
 * `raySphereRoots`) and the ground it lands on is compared with the grabbed
 * point — the error is reported in CSS pixels via the ground-per-pixel the
 * drag is supposed to track at.
 *
 * Diagnostic for the 2026-08-24 report ("dragging on earth doesn't translate
 * 1:1 any more, and it's different on different parts of the globe; near the
 * poles horizontal dragging is a lot slower").
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { attachOrbitControls } from '../../../../src/services/camera/orbitControls';
import { surfaceDragRotation } from '../../../../src/utils/camera/surfaceDragRotation';
import { createOrbitCamera } from '../../../../src/utils/camera/createOrbitCamera';
import { cursorRayWorld } from '../../../../src/utils/camera/cursorRayWorld';
import { cursorSurfaceHit } from '../../../../src/utils/camera/cursorSurfaceHit';
import { raySphereRoots } from '../../../../src/utils/math/raySphereRoots';
import { lonLatDegToDirection } from '../../../../src/utils/scene/lonLatDegToDirection';
import { eyeAltitudeMpc } from '../../../../src/utils/camera/eyeAltitudeMpc';
import { updatePosition } from '../../../../src/utils/camera/updatePosition';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import { dragSolveProbe } from './__fixtures/dragSolveProbe';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { LonLatDeg } from '../../../../src/@types/scene/LonLatDeg';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const R_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;
const KM = SCALE_UNITS.KM_TO_MPC;
// Earth's real world position magnitude (1 AU from the Sun at the origin) —
// the cancellation regime every screen-space residual is computed in.
const CENTRE_MPC: Vec3 = [4.185434713106926e-12, -2.3450604345518434e-12, -1.0165741690099294e-12];
const CANVAS = { width: 1512, height: 858 };
const ASPECT = CANVAS.width / CANVAS.height;
const FOV = (Math.PI / 180) * 60;
const CENTRE_CSS = { x: CANVAS.width / 2, y: CANVAS.height / 2 };
const EARTH: BodyId = 'earth' as BodyId;

type Listener = (e: unknown) => void;

function makeRecorder() {
  const listeners: Array<{ type: string; handler: Listener }> = [];
  const target = {
    addEventListener(type: string, handler: Listener): void {
      listeners.push({ type, handler });
    },
    removeEventListener(type: string, handler: Listener): void {
      const i = listeners.findIndex((l) => l.type === type && l.handler === handler);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const fire = (type: string, event: unknown): void => {
    for (const l of [...listeners]) if (l.type === type) l.handler(event);
  };
  return { target, fire };
}

function makeCanvas() {
  const rec = makeRecorder();
  const canvas = Object.assign(rec.target, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => false,
    clientWidth: CANVAS.width,
    clientHeight: CANVAS.height,
    width: CANVAS.width,
    height: CANVAS.height,
  });
  return { canvas, rec };
}

let win: ReturnType<typeof makeRecorder>;
let originalWindow: unknown;

beforeEach(() => {
  win = makeRecorder();
  const g = globalThis as unknown as Record<string, unknown>;
  originalWindow = g.window;
  g.window = win.target;
});

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (originalWindow === undefined) delete g.window;
  else g.window = originalWindow;
});

function makeCam(latDeg: number, altKm: number): OrbitCamera {
  return createOrbitCamera({
    target: [CENTRE_MPC[0], CENTRE_MPC[1], CENTRE_MPC[2]],
    distance: R_MPC + altKm * KM,
    yaw: 0,
    // The pose frame's pole is the orientation frame's; parking pitch at
    // `latDeg` puts the sub-camera ground point on that latitude.
    pitch: (Math.PI / 180) * latDeg,
    fovYRad: FOV,
    aspect: ASPECT,
    near: 1e-18,
    far: 1,
  });
}

function forwardOf(cam: OrbitCamera): Vec3 {
  const f: Vec3 = [
    cam.target[0] - cam.position[0],
    cam.target[1] - cam.position[1],
    cam.target[2] - cam.position[2],
  ];
  const m = Math.hypot(f[0], f[1], f[2]) || 1;
  return [f[0] / m, f[1] / m, f[2] / m];
}

function rayAt(cam: OrbitCamera, css: { x: number; y: number }) {
  return cursorRayWorld(css, CANVAS, cam.position, forwardOf(cam), 0, [0, 1, 0], FOV, ASPECT);
}

function groundHit(cam: OrbitCamera, css: { x: number; y: number }): Vec3 | null {
  const ray = rayAt(cam, css);
  const roots = raySphereRoots(ray.origin, ray.direction, CENTRE_MPC, R_MPC);
  if (roots === null || roots[0] < 0) return null;
  return [
    ray.origin[0] + roots[0] * ray.direction[0],
    ray.origin[1] + roots[0] * ray.direction[1],
    ray.origin[2] + roots[0] * ray.direction[2],
  ];
}

function worldOf(p: LonLatDeg): Vec3 {
  const d = lonLatDegToDirection(p);
  return [CENTRE_MPC[0] + d[0] * R_MPC, CENTRE_MPC[1] + d[1] * R_MPC, CENTRE_MPC[2] + d[2] * R_MPC];
}

/** Ground metres one CSS pixel spans at the sub-camera point — the rate the
 * drag is supposed to track at, and the yardstick the error is quoted in. */
function groundPerPxMpc(altMpc: number): number {
  return (2 * Math.tan(FOV / 2) * altMpc) / CANVAS.height;
}

type Trace = {
  latDeg: number;
  altKm: number;
  errPx: number;
  gain: number;
  solveAccepted: boolean;
  reason: string;
  residualPx: number;
  stepRatio: number;
};

/**
 * One gesture: grab at screen centre, then `steps` moves of (dxPx, dyPx).
 * Returns the residual between the cursor's ground point and the grabbed one.
 */
function traceDrag(
  latDeg: number,
  altKm: number,
  dxPx: number,
  dyPx: number,
  steps: number,
): Trace {
  const cam = makeCam(latDeg, altKm);
  const grabbed = cursorSurfaceHit(rayAt(cam, CENTRE_CSS), CENTRE_MPC, R_MPC, IDENTITY_MAT3);
  if (grabbed === null) throw new Error('fixture: centre ray misses the body');

  // Does the exact solve accept this gesture's FIRST event? (The latch makes
  // that one answer decide the whole gesture.)
  const solveAccepted =
    surfaceDragRotation(
      grabbed,
      IDENTITY_MAT3,
      CENTRE_MPC,
      R_MPC,
      cam,
      0,
      [0, 1, 0],
      FOV,
      ASPECT,
      CANVAS,
      { x: CENTRE_CSS.x + dxPx, y: CENTRE_CSS.y + dyPx },
      Math.hypot(dxPx, dyPx),
    ) !== null;
  const probe = dragSolveProbe(
    grabbed,
    IDENTITY_MAT3,
    CENTRE_MPC,
    R_MPC,
    cam,
    0,
    [0, 1, 0],
    FOV,
    ASPECT,
    CANVAS,
    { x: CENTRE_CSS.x + dxPx, y: CENTRE_CSS.y + dyPx },
    Math.hypot(dxPx, dyPx),
  );

  const { canvas, rec } = makeCanvas();
  const detach = attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, {
    pivotRadiusMpc: () => R_MPC,
    pivotAltitudeMpc: () => eyeAltitudeMpc(cam.position, CENTRE_MPC, R_MPC),
    hoveredSurfacePoint: () => ({ bodyId: EARTH, point: grabbed }),
    dragPivotFrame: () => ({
      bodyId: EARTH,
      bodyOrientation: [...IDENTITY_MAT3],
      bodyCentreMpc: CENTRE_MPC,
      radiusMpc: R_MPC,
      pinnedTargetMpc: null,
    }),
  });

  rec.fire('pointerdown', {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: CENTRE_CSS.x,
    clientY: CENTRE_CSS.y,
  });
  let cx = CENTRE_CSS.x;
  let cy = CENTRE_CSS.y;
  for (let i = 0; i < steps; i++) {
    cx += dxPx;
    cy += dyPx;
    win.fire('pointermove', { pointerId: 1, clientX: cx, clientY: cy });
  }
  detach();

  const alt = eyeAltitudeMpc(cam.position, CENTRE_MPC, R_MPC);
  const hit = groundHit(cam, { x: cx, y: cy });
  const gw = worldOf(grabbed);
  const meta = {
    solveAccepted,
    reason: probe.reason,
    residualPx: probe.bestResidualPx,
    stepRatio: probe.stepRad / probe.maxStepRad,
  };
  if (hit === null) return { latDeg, altKm, errPx: Infinity, gain: 0, ...meta };

  const errMpc = Math.hypot(hit[0] - gw[0], hit[1] - gw[1], hit[2] - gw[2]);
  const errPx = errMpc / groundPerPxMpc(alt);
  const draggedPx = Math.hypot(dxPx, dyPx) * steps;
  return { latDeg, altKm, errPx, gain: 1 - errPx / draggedPx, ...meta };
}

describe('drag trace — the grabbed ground point vs the cursor', () => {
  const LATS = [0, 15, 30, 45, 60, 70, 75, 80, 85];
  const ALTS = [1, 10, 100, 1000, 10000];

  it('horizontal drag: reports the per-latitude tracking error', () => {
    const rows: Trace[] = [];
    for (const alt of ALTS) for (const lat of LATS) rows.push(traceDrag(lat, alt, 4, 0, 10));
    // eslint-disable-next-line no-console
    console.log(
      '\nHORIZONTAL (40 px)\nalt(km)\tlat\terr(px)\tgain\tsolve\treason\tresid(px)\tstep/max\n' +
        rows
          .map(
            (r) =>
              `${r.altKm}\t${r.latDeg}\t${r.errPx.toFixed(2)}\t${r.gain.toFixed(3)}\t${r.solveAccepted ? 'exact' : 'FLAT'}\t${r.reason}\t${r.residualPx.toExponential(1)}\t${r.stepRatio.toFixed(2)}`,
          )
          .join('\n'),
    );
    for (const r of rows) expect(r.errPx).toBeLessThan(1);
  });

  it('vertical drag: reports the per-latitude tracking error', () => {
    const rows: Trace[] = [];
    for (const alt of ALTS) for (const lat of LATS) rows.push(traceDrag(lat, alt, 0, 4, 10));
    // eslint-disable-next-line no-console
    console.log(
      '\nVERTICAL (40 px)\nalt(km)\tlat\terr(px)\tgain\tsolve\treason\tresid(px)\tstep/max\n' +
        rows
          .map(
            (r) =>
              `${r.altKm}\t${r.latDeg}\t${r.errPx.toFixed(2)}\t${r.gain.toFixed(3)}\t${r.solveAccepted ? 'exact' : 'FLAT'}\t${r.reason}\t${r.residualPx.toExponential(1)}\t${r.stepRatio.toFixed(2)}`,
          )
          .join('\n'),
    );
    for (const r of rows) {
      // One row cannot track, and it is geometry rather than the solve: 40 px at
      // 10 000 km is ~4.8° of ground, so a pull from lat 85 reaches the pole
      // first and stops at PITCH_LIMIT (89.43°), ~0.4° = ~3.6 px short of the
      // cursor. Dragging over the pole is not expressible in yaw/pitch at all.
      const overThePole = r.altKm === 10000 && r.latDeg === 85;
      expect(r.errPx, `alt ${r.altKm} km, lat ${r.latDeg}`).toBeLessThan(overThePole ? 4 : 1);
    }
  });

  it('oblique grab at a fixed latitude: reports the per-incidence tracking error', () => {
    // Same gesture, grab moved off screen centre so the ray meets the ground at
    // a growing incidence angle — disentangles obliquity from latitude.
    const rows: Array<{ offPx: number; incDeg: number; errPx: number; solve: boolean }> = [];
    const alt = 1000;
    for (const offPx of [0, 100, 200, 300, 400, 500, 600]) {
      const cam = makeCam(0, alt);
      const grabCss = { x: CENTRE_CSS.x + offPx, y: CENTRE_CSS.y };
      const grabbed = cursorSurfaceHit(rayAt(cam, grabCss), CENTRE_MPC, R_MPC, IDENTITY_MAT3);
      if (grabbed === null) continue;
      const gw = worldOf(grabbed);
      const ray = rayAt(cam, grabCss);
      const n: Vec3 = [
        (gw[0] - CENTRE_MPC[0]) / R_MPC,
        (gw[1] - CENTRE_MPC[1]) / R_MPC,
        (gw[2] - CENTRE_MPC[2]) / R_MPC,
      ];
      const cosInc = -(ray.direction[0] * n[0] + ray.direction[1] * n[1] + ray.direction[2] * n[2]);
      const incDeg = (Math.acos(Math.min(1, Math.max(-1, cosInc))) * 180) / Math.PI;

      const solve = surfaceDragRotation(
        grabbed,
        IDENTITY_MAT3,
        CENTRE_MPC,
        R_MPC,
        cam,
        0,
        [0, 1, 0],
        FOV,
        ASPECT,
        CANVAS,
        { x: grabCss.x + 4, y: grabCss.y },
        4,
      );

      const { canvas, rec } = makeCanvas();
      const detach = attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, {
        pivotRadiusMpc: () => R_MPC,
        pivotAltitudeMpc: () => eyeAltitudeMpc(cam.position, CENTRE_MPC, R_MPC),
        hoveredSurfacePoint: () => ({ bodyId: EARTH, point: grabbed }),
        dragPivotFrame: () => ({
          bodyId: EARTH,
          bodyOrientation: [...IDENTITY_MAT3],
          bodyCentreMpc: CENTRE_MPC,
          radiusMpc: R_MPC,
          pinnedTargetMpc: null,
        }),
      });
      rec.fire('pointerdown', {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX: grabCss.x,
        clientY: grabCss.y,
      });
      let cx = grabCss.x;
      for (let i = 0; i < 10; i++) {
        cx += 4;
        win.fire('pointermove', { pointerId: 1, clientX: cx, clientY: grabCss.y });
      }
      detach();

      const hit = groundHit(cam, { x: cx, y: grabCss.y });
      const altMpc = eyeAltitudeMpc(cam.position, CENTRE_MPC, R_MPC);
      const errPx =
        hit === null
          ? Infinity
          : Math.hypot(hit[0] - gw[0], hit[1] - gw[1], hit[2] - gw[2]) / groundPerPxMpc(altMpc);
      rows.push({ offPx, incDeg, errPx, solve: solve !== null });
    }
    // eslint-disable-next-line no-console
    console.log(
      '\nOBLIQUE (lat 0, alt 1000 km, 40 px horizontal)\noff(px)\tinc(deg)\terr(px)\tsolve\n' +
        rows
          .map(
            (r) =>
              `${r.offPx}\t${r.incDeg.toFixed(1)}\t${r.errPx.toFixed(2)}\t${r.solve ? 'exact' : 'FLAT'}`,
          )
          .join('\n'),
    );
    for (const r of rows) expect(r.errPx).toBeLessThan(1);
  });
});

describe('drag trace — why the exact solve declines', () => {
  /** Probe the solve for a nadir grab at `altKm`, body centred at `centre`. */
  function probeAt(centre: Vec3, altKm: number) {
    const cam = createOrbitCamera({
      target: [centre[0], centre[1], centre[2]],
      distance: R_MPC + altKm * KM,
      yaw: 0,
      pitch: 0,
      fovYRad: FOV,
      aspect: ASPECT,
      near: 1e-18,
      far: 1,
    });
    const ray = cursorRayWorld(
      CENTRE_CSS,
      CANVAS,
      cam.position,
      forwardOf(cam),
      0,
      [0, 1, 0],
      FOV,
      ASPECT,
    );
    const grabbed = cursorSurfaceHit(ray, centre, R_MPC, IDENTITY_MAT3);
    if (grabbed === null) throw new Error('fixture: centre ray misses');
    return dragSolveProbe(
      grabbed,
      IDENTITY_MAT3,
      centre,
      R_MPC,
      cam,
      0,
      [0, 1, 0],
      FOV,
      ASPECT,
      CANVAS,
      { x: CENTRE_CSS.x + 4, y: CENTRE_CSS.y },
      4,
    );
  }

  it('the same drag converges once the body sits at the world origin', () => {
    // Isolates the blocker: with `bodyCentre` at 1 AU, `grabbedWorld − eye`
    // cancels four decades of mantissa away and the achievable screen residual
    // never reaches RESIDUAL_TOL_PX = 1e-9 px. Same geometry, body at the
    // origin, no cancellation → converges.
    const rows = [1, 10, 100, 1000, 10000].map((altKm) => ({
      altKm,
      atOrigin: probeAt([0, 0, 0], altKm),
      atOneAu: probeAt(CENTRE_MPC, altKm),
    }));
    // eslint-disable-next-line no-console
    console.log(
      '\nSOLVE OUTCOME vs BODY WORLD POSITION (nadir grab, 4 px drag)\n' +
        'alt(km)\torigin\tresid(px)\t1 AU\tresid(px)\n' +
        rows
          .map(
            (r) =>
              `${r.altKm}\t${r.atOrigin.reason}\t${r.atOrigin.bestResidualPx.toExponential(1)}\t` +
              `${r.atOneAu.reason}\t${r.atOneAu.bestResidualPx.toExponential(1)}`,
          )
          .join('\n'),
    );
    for (const r of rows) expect(r.atOrigin.reason).toBe('ok');
  });

  it('the pre-865b62e7b semantics (return the last Newton iterate) track 1:1 at every latitude', () => {
    // 21ab20b20 `break`-ed out of the Newton loop and returned `{yaw, pitch}`
    // unconditionally. Non-convergence against a 1e-9 px tolerance does not mean
    // a bad answer — the iterate sits at the noise floor, which is 1e-6 px. This
    // replays a full gesture with that rule and measures the same residual the
    // HEAD trace above measures.
    const rows: Array<{ altKm: number; latDeg: number; errPx: number }> = [];
    for (const altKm of [1, 100, 1000]) {
      for (const latDeg of [0, 30, 60, 80, 85]) {
        const cam = makeCam(latDeg, altKm);
        const grabbed = cursorSurfaceHit(rayAt(cam, CENTRE_CSS), CENTRE_MPC, R_MPC, IDENTITY_MAT3);
        if (grabbed === null) continue;
        let cx = CENTRE_CSS.x;
        for (let i = 0; i < 10; i++) {
          cx += 4;
          const p = dragSolveProbe(
            grabbed,
            IDENTITY_MAT3,
            CENTRE_MPC,
            R_MPC,
            cam,
            0,
            [0, 1, 0],
            FOV,
            ASPECT,
            CANVAS,
            { x: cx, y: CENTRE_CSS.y },
            4,
          );
          cam.yaw = p.yaw;
          cam.pitch = p.pitch;
          updatePosition(cam);
        }
        const hit = groundHit(cam, { x: cx, y: CENTRE_CSS.y });
        const gw = worldOf(grabbed);
        const alt = eyeAltitudeMpc(cam.position, CENTRE_MPC, R_MPC);
        rows.push({
          altKm,
          latDeg,
          errPx:
            hit === null
              ? Infinity
              : Math.hypot(hit[0] - gw[0], hit[1] - gw[1], hit[2] - gw[2]) / groundPerPxMpc(alt),
        });
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      '\nPRE-865b62e7b SEMANTICS (40 px horizontal)\nalt(km)\tlat\terr(px)\n' +
        rows.map((r) => `${r.altKm}\t${r.latDeg}\t${r.errPx.toExponential(2)}`).join('\n'),
    );
    for (const r of rows) expect(r.errPx).toBeLessThan(0.01);
  });

  it('FW-H’s raySphereRoots rewrite does not move the grabbed point', () => {
    // The only place the drag chain touches raySphereRoots is the hover hit
    // that captures the grab. Old form: discr = b² − (|m|² − r²).
    const oldRoots = (ro: Vec3, rd: Vec3, c: Vec3, radius: number): [number, number] | null => {
      const mx = ro[0] - c[0];
      const my = ro[1] - c[1];
      const mz = ro[2] - c[2];
      const b = mx * rd[0] + my * rd[1] + mz * rd[2];
      const cc = mx * mx + my * my + mz * mz - radius * radius;
      const discr = b * b - cc;
      if (discr < 0) return null;
      const s = Math.sqrt(discr);
      return [-b - s, -b + s];
    };

    let worstKm = 0;
    for (const altKm of [0.1, 1, 10, 100, 1000, 10000]) {
      const cam = makeCam(0, altKm);
      for (let px = 20; px < CANVAS.width; px += 37) {
        const ray = rayAt(cam, { x: px, y: CENTRE_CSS.y });
        const a = raySphereRoots(ray.origin, ray.direction, CENTRE_MPC, R_MPC);
        const b = oldRoots(ray.origin as Vec3, ray.direction as Vec3, CENTRE_MPC as Vec3, R_MPC);
        expect(a === null).toBe(b === null);
        if (a === null || b === null) continue;
        worstKm = Math.max(worstKm, (Math.abs(a[0] - b[0]) * 1) / KM);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\nraySphereRoots old vs new, worst tNear delta across the disc: ${worstKm} km`);
    expect(worstKm).toBeLessThan(1e-6);
  });
});
