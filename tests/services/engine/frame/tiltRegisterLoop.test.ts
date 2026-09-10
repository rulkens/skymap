/**
 * tiltRegisterLoop — R12b-1: the register holds the AUTHORED centre-looking
 * pose; the displayed pose is a pure projection derived at read. Storing the
 * PROJECTED pose instead and re-pinning/re-projecting it each frame would
 * walk the eye 8,519 km per frame during ANY in-window drag — including
 * press-and-hold with zero pointer motion — while displayed tilt and h/R
 * stay constant (invisible on screen, catastrophic in state). Real runFrame
 * loop, real gesture steps.
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

import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { diveUntilEngaged } from '../../../helpers/camera/diveUntilEngaged';
import { seedRememberedTilt } from '../../../helpers/camera/seedRememberedTilt';
import { displayedEye } from '../../../helpers/camera/displayedEye';
import { hrOfPose } from '../../../helpers/camera/hrOfPose';
import { tiltOfPose } from '../../../helpers/camera/tiltOfPose';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import {
  beginDrag,
  setAutoRotate,
  startCameraTween,
} from '../../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraSimHarness } from '../../../helpers/camera/CameraSimHarness';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const EARTH = deriveBodyStates(CONST_J2000).get('earth')! as BodyState;
const EARTH_RADIUS_M = SCENE_EARTH.radiusM;
const MPC_TO_KM = 1 / SCALE_UNITS.M_TO_MPC / 1000;

/** Displayed pose vs Earth: eye, h/R, and angle(view axis, nadir). */
function display(state: EngineState): { eye: Vec3; tilt: number; hr: number } {
  const live = liveWorldPose(state);
  const eye = displayedEye(state);
  return { eye, tilt: tiltOfPose(live, eye, EARTH), hr: hrOfPose(eye, EARTH, EARTH_RADIUS_M) };
}

function stepKm(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) * MPC_TO_KM;
}

/**
 * Same approach recipe as tiltCommitIdempotence: dive engaged, set a large
 * remembered tilt through surfaceStep's tilt/look drag steps, zoom out past
 * disengage, then back IN to mid-window — world-armed, pivot-pinned,
 * projection live.
 */
function toMidWindow(h: CameraSimHarness) {
  diveUntilEngaged(h);
  expect(h.state.cameraRuntime.register.pose.frame).not.toBe('absolute');

  // Set the memory via surfaceStep's tilt/look steps (unit-radius, h/R 0.15 so the
  // tilt ceiling is open under ruling 19's tighter band).
  seedRememberedTilt(h, { targetRad: 0.95, guard: 40, pxStep: 5 });
  expect(h.state.cameraRuntime.surface.rememberedTiltRad).toBeGreaterThan(0.5);

  // Out past disengage, back in to mid-window; thresholds rescaled for
  // ruling 19's tighter band (engage 0.2 / disengage 0.4, was 1.7/3.4).
  while (display(h.state).hr < 0.45) h.wheel(100);
  expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute');
  while (display(h.state).hr > 0.32) h.wheel(-100);
  expect(display(h.state).hr).toBeGreaterThan(0.26);
  expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute');

  h.frame(60);
  expect(display(h.state).tilt).toBeGreaterThan(0.2); // projection live here
}

describe('the register loop during an active drag (R12b-1)', () => {
  it('press-and-hold with ZERO pointer motion leaves the eye byte-stable', () => {
    const h = makeCameraSimHarness();
    toMidWindow(h);

    // Press and hold: dragging=true, an anchor, and no pointer motion at all.
    // Storing the PROJECTED pose and re-pinning/re-projecting it each frame
    // would walk the eye 8,519 km per frame with tilt and h/R constant
    // (nothing on screen moves except the ground underneath).
    h.store.dispatch(beginDrag());
    h.push({ kind: 'gestureStart' });
    h.push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
    h.frame();

    const before = display(h.state);
    for (let i = 0; i < 20; i += 1) {
      h.frame();
      const after = display(h.state);
      expect(stepKm(before.eye, after.eye)).toBeLessThan(1e-9);
      expect(Math.abs(after.tilt - before.tilt)).toBeLessThan(1e-9);
    }
  });

  it('the register holds the AUTHORED centre-looking pose; readers see the projection', () => {
    const h = makeCameraSimHarness();
    toMidWindow(h);

    h.store.dispatch(beginDrag());
    h.push({ kind: 'gestureStart' });
    h.push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
    h.push({ kind: 'dragMove', mode: 'orbit', xPx: 52, yPx: 50 });
    h.frame();

    // Authored register: centre-looking (tilt ~0). Displayed (what pick, the
    // clip/tween seams, and the draw path read via liveWorldPose): the full
    // mapped tilt. Same eye — the projection is eye-preserving by contract.
    const register = h.state.cameraRuntime.register.pose;
    expect(register.frame).toBe('absolute');
    if (register.frame !== 'absolute') return;
    const registerEye = eyeMpcOf(register.pose, B);
    expect(tiltOfPose(register.pose, registerEye, EARTH)).toBeLessThan(1e-6);

    const displayed = display(h.state);
    expect(displayed.tilt).toBeGreaterThan(0.2);
    expect(stepKm(registerEye, displayed.eye)).toBeLessThan(1e-9);
  });

  it('displayed pose is continuous through drag, release, and an edge deactivation', () => {
    const h = makeCameraSimHarness();
    toMidWindow(h);
    let prev = display(h.state);

    // A real 6-px drag across three frames, then release.
    h.store.dispatch(beginDrag());
    h.push({ kind: 'gestureStart' });
    h.push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
    for (const x of [52, 54, 56]) {
      h.push({ kind: 'dragMove', mode: 'orbit', xPx: x, yPx: 50 });
      h.frame();
      const cur = display(h.state);
      // Each frame moves the eye by the 2-px drag mapping only — never a
      // teleport (a projected register would add ~8,519 km/frame on top of the drag).
      expect(stepKm(prev.eye, cur.eye)).toBeLessThan(500);
      prev = cur;
    }
    h.push({ kind: 'gestureEnd' });
    for (let i = 0; i < 10; i += 1) {
      h.frame();
      const cur = display(h.state);
      expect(stepKm(prev.eye, cur.eye)).toBeLessThan(500);
      expect(Math.abs(cur.tilt - prev.tilt)).toBeLessThan(0.02);
      prev = cur;
    }

    // The commit-on-edge render override (autoRotate rate 0 start → stop):
    // the deactivation frame must render the displayed image, not a one-frame
    // untilted pop, and must not re-pin the projected pose (no eye step).
    h.store.dispatch(setAutoRotate({ active: true, rate: 0 }));
    h.frame(10);
    prev = display(h.state);
    h.store.dispatch(setAutoRotate({ active: false, rate: 0 }));
    for (let i = 0; i < 10; i += 1) {
      h.frame();
      const cur = display(h.state);
      expect(stepKm(prev.eye, cur.eye)).toBeLessThan(1e-6);
      expect(Math.abs(cur.tilt - prev.tilt)).toBeLessThan(1e-6);
      prev = cur;
    }
  });

  it('a fresh followBody capture in-window starts from the authored pose (no re-pin walk)', () => {
    const h = makeCameraSimHarness();
    toMidWindow(h);

    // Re-select the same body: a fresh focus ROW reference re-arms the follow
    // ease, whose `from` capture pairs captured yaw/pitch with a body-centred
    // target. Captured from the DISPLAYED (tilted) pose that decode walks the
    // eye by d·2sin(τ/2) ≈ 8,519 km on the first eased frame — the capture
    // must read the authored register instead.
    const prev = display(h.state);
    h.store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: 'earth',
          label: 'Earth',
          positionMpc: [0, 0, 0],
          radiusM: SCENE_EARTH.radiusM,
        },
      }),
    );
    h.frame();
    const cur = display(h.state);
    expect(stepKm(prev.eye, cur.eye)).toBeLessThan(1000);
  });

  it('a tween start in-window (NON-pivoting incoming driver) draws the displayed image on the edge frame', () => {
    const h = makeCameraSimHarness();
    toMidWindow(h);
    const before = display(h.state);

    // Seed the tween the way watchFocusTweenSaga does: `from` = the DISPLAYED
    // live pose. The followBody→tween deactivation edge fires with an incoming
    // driver that neither pins nor projects, so an authored (untilted) render
    // override flashes 0.40 rad ≈ 453 px to nadir for exactly one frame
    // (R12c-1) — the override must fall back to the displayed box there.
    const from = liveWorldPose(h.state);
    h.store.dispatch(
      startCameraTween({
        from,
        to: { ...from, target: [...from.target] as Vec3, distance: from.distance * 1.5 },
        durationMs: 400,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    h.frame(); // the edge frame: followBody commits, the override renders
    const edge = display(h.state);
    expect(Math.abs(edge.tilt - before.tilt)).toBeLessThan(0.01);

    // And the register stayed AUTHORED (R12c-4a): the displayed override must
    // not be stamped back into it — a drag folding from a projected register
    // on the next drain re-opens the walk.
    const register = h.state.cameraRuntime.register.pose;
    expect(register.frame).toBe('absolute');
    if (register.frame !== 'absolute') return;
    const registerEye = eyeMpcOf(register.pose, B);
    expect(tiltOfPose(register.pose, registerEye, EARTH)).toBeLessThan(1e-6);
  });
});
