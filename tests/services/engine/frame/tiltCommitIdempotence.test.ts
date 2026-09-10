/**
 * tiltCommitIdempotence — R12-1: `camera.base` stays centre-looking by
 * WIRING. The tilt projection (`approachTiltedPose`) holds the eye by moving
 * `target` off the body centre; the pivot pin SETS target to the centre and
 * derives the eye — composing them on a COMMITTED tilted pose moves the eye
 * by d·2sin(τ/2) and ACCUMULATES over commit→re-derive cycles. Committing
 * once and only reading afterward wouldn't exercise that; this fixture
 * commits mid-window, repeatedly, where the two contracts actually compose.
 * Real runFrame loop, real gesture steps.
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
import { beginDrag, setAutoRotate } from '../../../../src/state/camera/cameraSlice';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { SURFACE_REGIME } from '../../../../src/data/camera/surfaceRegime';
import { bodyUpWeight } from '../../../../src/utils/camera/bodyUpWeight';
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

/**
 * Shared approach: dive engaged, set a large remembered tilt through the
 * surfaceStep's tilt/look drag steps, zoom out past disengage, then back IN to
 * mid-window — the world-armed, pivot-pinned, projection-live standpoint
 * where a broken composition would show up as the eye teleporting.
 */
function toMidWindow(h: CameraSimHarness): void {
  diveUntilEngaged(h);
  expect(h.state.cameraRuntime.register.pose.frame).not.toBe('absolute');

  // A deep memory (unit-radius surfaceStep drags — session state, same
  // rationale as tiltLerpRoundTrip's harness): the world arm is only reachable
  // ABOVE engage, and the 2026-09-10 band leaves a thin weight there, so a
  // small memory would map to a projection too shallow to compose against.
  seedRememberedTilt(h, { targetRad: 2.8, guard: 60, pxStep: 5 });
  const remembered = h.state.cameraRuntime.surface.rememberedTiltRad;
  expect(remembered).toBeGreaterThan(2.5);

  // Out past disengage (arm flips absolute), then back in to the ONE
  // standpoint that is both world armed and inside the tilt band: just above
  // engage, where the hysteresis still holds the arm absolute. Coarse notches
  // to the neighbourhood, then tenth notches so the last cannot overshoot.
  const { disengageHR, engageHR } = SURFACE_REGIME;
  while (display(h.state).hr < disengageHR * 1.15) h.wheel(100);
  expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute');
  while (display(h.state).hr > engageHR * 1.5) h.wheel(-100);
  while (display(h.state).hr > engageHR * 1.02) h.wheel(-10);
  expect(display(h.state).hr).toBeGreaterThan(engageHR);
  expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute');

  // Let the follow ease and the projection settle before measuring.
  h.frame(60);
  // Projection live: display is `remembered × w`, read off the band rather
  // than pinned to a rad literal that only held while the bands shared edges.
  const live = display(h.state);
  expect(live.tilt).toBeGreaterThan(0.5 * remembered * bodyUpWeight(live.hr));
}

describe('commit → re-derive idempotence (R12-1)', () => {
  it('repeated in-window commits leave the eye fixed', () => {
    const h = makeCameraSimHarness();
    toMidWindow(h);

    // Each cycle: an empty in-window gesture (press + release) — gestureEnd
    // commits the register — then frames for the pin + projection to
    // re-derive. Without idempotence, each commit would bake the TILTED pose
    // and the pin would move the eye d·2sin(τ/2) ≈ thousands of km,
    // accumulating per cycle.
    const eyes: Vec3[] = [];
    for (let cycle = 0; cycle < 4; cycle += 1) {
      h.store.dispatch(beginDrag());
      h.push({ kind: 'gestureStart' });
      h.push({ kind: 'gestureEnd' });
      h.frame(60);
      eyes.push(display(h.state).eye);
    }
    // The OTHER reachable commit path (b): a commit-on-edge. Rate 0 so the
    // spin authors no motion — a start/stop pair is a pure commit cycle
    // through runFrame's edge bake rather than replayInput's gestureEnd.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      h.store.dispatch(setAutoRotate({ active: true, rate: 0 }));
      h.frame(10);
      h.store.dispatch(setAutoRotate({ active: false, rate: 0 }));
      h.frame(60);
      eyes.push(display(h.state).eye);
    }
    for (let cycle = 1; cycle < eyes.length; cycle += 1) {
      const [a, b] = [eyes[cycle - 1]!, eyes[cycle]!];
      const jumpKm = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) * MPC_TO_KM;
      expect(jumpKm).toBeLessThan(1);
    }
  });

  it('an in-window drag release commits a centre-looking base with no visual pop', () => {
    const h = makeCameraSimHarness();
    toMidWindow(h);
    const before = display(h.state);

    h.store.dispatch(beginDrag());
    h.push({ kind: 'gestureStart' });
    h.push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
    h.push({ kind: 'dragMove', mode: 'orbit', xPx: 52, yPx: 50 });
    h.push({ kind: 'gestureEnd' });
    h.frame();

    // The committed base is centre-looking — the projection stayed render-side.
    const base = h.store.getState().camera.base;
    expect(base.frame).toBe('absolute');
    if (base.frame !== 'absolute') return;
    const baseEye = eyeMpcOf(base.pose, B);
    expect(tiltOfPose(base.pose, baseEye, EARTH)).toBeLessThan(1e-6);

    // And the DISPLAYED tilt is unchanged across the commit (no pop).
    h.frame(8);
    const after = display(h.state);
    expect(Math.abs(after.tilt - before.tilt)).toBeLessThan(0.02);
    // The release itself moved the eye by at most the 2 px drag, not a
    // teleport: the bar is a fraction of the pivot chord `d·2sin(τ/2)` a
    // committed tilted pose would walk, which scales with the band's weight
    // at this standpoint.
    const shiftKm =
      Math.hypot(
        before.eye[0]! - after.eye[0]!,
        before.eye[1]! - after.eye[1]!,
        before.eye[2]! - after.eye[2]!,
      ) * MPC_TO_KM;
    const chordKm = 2 * liveWorldPose(h.state).distance * Math.sin(before.tilt / 2) * MPC_TO_KM;
    expect(shiftKm).toBeLessThan(chordKm * 0.5);
  });
});
