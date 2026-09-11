/**
 * bodySwitchReset — ruling 18: a body switch fully resets the body pose.
 * Without the reset, the follow capture's distance carries across the
 * switch (e.g. Earth's ~2.4 R⊕ ≈ 0.26 R♄), the fold can engage the new body
 * on the very next frame with the eye still inside it, and the absolute-arm
 * gate then blocks the follow row with disengage unreachable — the remembered
 * tilt must reset too. Real runFrame loop.
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
import { tiltOverBody } from '../../../helpers/camera/tiltOverBody';
import { displayedEye } from '../../../helpers/camera/displayedEye';
import { hrOverBody } from '../../../helpers/camera/hrOverBody';
import { DEFAULT_CAMERA_TUNING as TUNING } from '../../../../src/data/camera/cameraTuning';
import { bodyFocusDistance } from '../../../../src/services/engine/camera/bodyFocusDistance';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const SIM = CONST_J2000;
const BODIES = deriveBodyStates(SIM);
const SATURN = BODIES.get('saturn')! as BodyState;
const R_SATURN_M = 58232000;
const R_SATURN_MPC = R_SATURN_M * SCALE_UNITS.M_TO_MPC;
// The harness settings put fovDeg 60 on the store; runFrame stamps it onto
// the projection every frame, so the framing target is computed at π/3.
const FRAMING_MPC = bodyFocusDistance(R_SATURN_MPC, Math.PI / 3);

function distTo(eye: Readonly<Vec3>, body: BodyState): number {
  return Math.hypot(
    eye[0]! - body.positionMpc[0]!,
    eye[1]! - body.positionMpc[1]!,
    eye[2]! - body.positionMpc[2]!,
  );
}

describe('body switch reset (ruling 18)', () => {
  it('engaged Earth + remembered tilt → focus Saturn: lands OUTSIDE at the framing distance, tilt and memory reset', () => {
    const h = makeCameraSimHarness();

    // Dive into the Earth surface regime and author a tilt there.
    diveUntilEngaged(h);
    expect(h.state.cameraRuntime.register.pose.frame).not.toBe('absolute');
    seedRememberedTilt(h);
    expect(h.state.cameraRuntime.surface.rememberedTiltRad).toBeGreaterThan(0.3);

    // The user's action. The real saga path dispatches NO tween for a moving
    // body (watchFocusTweenSaga gates on bodyMovesThisFrame) — the follow row IS
    // the flight, so the store focus write alone reproduces the app flow.
    h.focus('saturn');

    // Without the reset the eye would land at 0.259 R♄ (inside Saturn) on
    // frame 1 and engage there; every post-switch frame must stay outside
    // the planet.
    for (let i = 0; i < 200; i += 1) {
      h.frame();
      expect(distTo(displayedEye(h.state), SATURN)).toBeGreaterThan(R_SATURN_MPC);
    }

    // Arrival: the actual focus framing distance (outside, FOV-framed), the
    // approach not stranded by a bogus engage (the follow hold still owns the
    // frame on the absolute arm), a centre-looking display, and the memory
    // read back as 0.
    const dSat = distTo(displayedEye(h.state), SATURN);
    expect(Math.abs(dSat - FRAMING_MPC) / FRAMING_MPC).toBeLessThan(1e-3);
    expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute');
    expect(h.state.cameraRuntime.register.winner).toBe('followHold');
    expect(tiltOverBody(h.state, SATURN)).toBeLessThan(1e-6);
    expect(h.state.cameraRuntime.surface.rememberedTiltRad).toBe(0);
  });

  it('a body switch is a FLIGHT to the framing distance, never a cut', () => {
    const h = makeCameraSimHarness();

    // Settle the session's first follow at Earth, then switch to Saturn.
    h.frame(80);
    h.focus('saturn');

    // The eye starts where it was (Earth's neighbourhood, ~2e4 R♄ out) and
    // approaches monotonically; a capture that adopts the framing distance
    // as its START teleports the eye there on the first frame.
    const ds: number[] = [];
    for (let i = 0; i < 150; i += 1) {
      h.frame();
      ds.push(distTo(displayedEye(h.state), SATURN));
    }
    expect(ds[0]!).toBeGreaterThan(FRAMING_MPC * 10);
    for (let i = 1; i < ds.length; i += 1) {
      expect(ds[i]!).toBeLessThanOrEqual(ds[i - 1]! * (1 + 1e-9));
    }
    expect(Math.abs(ds[ds.length - 1]! - FRAMING_MPC) / FRAMING_MPC).toBeLessThan(1e-3);
    expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute');
    expect(h.state.cameraRuntime.register.winner).toBe('followHold');
  });

  it("the session's FIRST follow lands at the framing distance too", () => {
    const h = makeCameraSimHarness();

    // 11 R⊕ from Earth's centre is 1.2 R♄: a capture that carries that
    // distance across to Saturn engages there and never reaches the framing.
    h.focus('saturn');
    for (let i = 0; i < 200; i += 1) {
      h.frame();
      expect(distTo(displayedEye(h.state), SATURN)).toBeGreaterThan(R_SATURN_MPC);
    }
    const dSat = distTo(displayedEye(h.state), SATURN);
    expect(Math.abs(dSat - FRAMING_MPC) / FRAMING_MPC).toBeLessThan(1e-3);
    expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute');
  });

  it('same-body disengage/re-engage (with a null-focus stint) keeps the memory', () => {
    const h = makeCameraSimHarness();

    diveUntilEngaged(h);
    expect(h.state.cameraRuntime.register.pose.frame).not.toBe('absolute');
    seedRememberedTilt(h);
    const remembered = h.state.cameraRuntime.surface.rememberedTiltRad;
    expect(remembered).toBeGreaterThan(0.3);

    // Recede past disengage, clear the focus for a stint, re-focus Earth,
    // and dive back into the band — never a DIFFERENT body, so the memory
    // must survive the whole trip.
    const earth = h.bodies.get('earth')!;
    // Guard-bounded: a broken regime fails the assertion below rather than hanging.
    for (
      let i = 0;
      i < 40 && hrOverBody(h.state, earth, h.radiusM('earth')) < TUNING.disengageHR * 1.25;
      i += 1
    ) {
      h.wheel(100);
    }
    expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute');
    h.focus(null);
    h.frame(10);
    h.focus('earth');
    h.frame(10);
    diveUntilEngaged(h, { factor: 0.75, guard: 40 });
    expect(h.state.cameraRuntime.register.pose.frame).not.toBe('absolute');
    expect(h.state.cameraRuntime.surface.rememberedTiltRad).toBeCloseTo(remembered, 10);
  });

  it('a body switch while ABSOLUTE (never engaged on the new body) also resets the memory', () => {
    const h = makeCameraSimHarness();

    // Absolute at h/R 10 over Earth, Earth focused; one frame binds the
    // memory's body, then the tilt is authored (session state — the write
    // path itself is pinned in rememberedTilt.test.ts).
    h.frame();
    seedRememberedTilt(h);
    expect(h.state.cameraRuntime.surface.rememberedTiltRad).toBeGreaterThan(0.3);

    h.focus('saturn');
    h.frame(2);
    expect(h.state.cameraRuntime.surface.rememberedTiltRad).toBe(0);
  });
});
