/**
 * tiltLerpRoundTrip — ruling 13: display tilt is `remembered × w(h/R)` as a
 * pure function of altitude REGARDLESS of arm and direction. Expressing the
 * mapping only on the engaged arm would leave a focused zoom-out past
 * disengage and back in world-armed through the whole hysteresis window
 * (pivot-pinned to the body centre, tilt 0), with the remembered tilt only
 * returning at the engage notch as a capped 0.1 rad/notch walk — a visible
 * threshold flip. Real runFrame loop, real drag/wheel steps.
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
import { hrOverBody } from '../../../helpers/camera/hrOverBody';
import { tiltOverBody } from '../../../helpers/camera/tiltOverBody';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { mappedTiltRad } from '../../../../src/utils/camera/mappedTiltRad';
import { DEFAULT_CAMERA_TUNING as TUNING } from '../../../../src/data/camera/cameraTuning';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { BodyState } from '../../../../src/@types/scene/BodyState';

const EARTH = deriveBodyStates(CONST_J2000).get('earth')! as BodyState;
const EARTH_RADIUS_M = SCENE_EARTH.radiusM;

describe('tilt lerp round trip (ruling 13)', () => {
  it('display tilt tracks remembered × w through the window in BOTH directions', () => {
    const h = makeCameraSimHarness();

    // Dive to the band's full edge — the blend, not the arm, is the subject,
    // and w = 1 only at or below `fullHR` (the two bands no longer share an
    // edge). Engaged well before that, so the arm is body here either way.
    diveUntilEngaged(h, { factor: TUNING.tiltFullHR / TUNING.engageHR, guard: 90 });
    expect(h.state.cameraRuntime.register.pose.frame).not.toBe('absolute');

    // Set the memory through surfaceStep's own tilt/look drag steps. The
    // memory is session state and body-agnostic, so a unit-radius drag is
    // the same write path an engaged Earth drag takes — without hand-tuning
    // a metre-scale gesture through the whole input stack (the drag path
    // itself is pinned in rememberedTilt.test.ts). h/R 0.15 sits inside ruling
    // 19's tighter band, so the drags reach the memory. 2 px look steps: the loop
    // exits on remembered ≥ 0.35, and the engaged bar below is calibrated
    // for landing NEAR 0.35 — the dive transient scales with the memory, so
    // a coarse last increment inflates it.
    seedRememberedTilt(h, { targetRad: 0.35, guard: 6, pxStep: 2 });

    // Converge the engaged display onto the memory before tracing. The settle
    // spends only what the zoom spends (ruling 2026-09-10), so this is a
    // DITHER at one altitude, not a run of vanishing notches.
    for (let i = 0; i < 30; i += 1) {
      h.wheel(30);
      h.wheel(-30);
    }
    const remembered = h.state.cameraRuntime.surface.rememberedTiltRad;
    expect(remembered).toBeGreaterThan(0.3);
    expect(Math.abs(tiltOverBody(h.state, EARTH) - remembered)).toBeLessThan(0.03); // converged

    // Round trip: out past disengage, then back in below engage. At every
    // notch the display must sit on the ONE mapping — without it, the
    // zoom-in leg would be world-armed and pin-centred (tilt 0) through the
    // whole window, then walk 0.1/notch after the engage flip.
    const trace: { tilt: number; hr: number; arm: string }[] = [];
    const notch = (deltaY: number) => {
      h.wheel(deltaY);
      trace.push({
        tilt: tiltOverBody(h.state, EARTH),
        hr: hrOverBody(h.state, EARTH, EARTH_RADIUS_M),
        arm: h.state.cameraRuntime.register.pose.frame === 'absolute' ? 'abs' : 'body',
      });
    };
    // Both legs run to a live EDGE rather than a notch count: the band's log
    // span sets how many notches a crossing takes, so counts fork the moment
    // it is retuned.
    const lastHR = () => trace[trace.length - 1]!.hr;
    for (let i = 0; i < 200 && (i === 0 || lastHR() <= TUNING.disengageHR * 2); i += 1) {
      notch(100);
    }
    expect(lastHR()).toBeGreaterThan(TUNING.disengageHR * 2); // genuinely out
    for (let i = 0; i < 200 && lastHR() >= TUNING.tiltFullHR; i += 1) notch(-100);
    expect(lastHR()).toBeLessThan(TUNING.tiltFullHR); // genuinely back to full weight

    let prevTilt = trace[0]!.tilt;
    for (const s of trace) {
      // The pure function, both arms, both directions. World-armed rows sit
      // on the map to 4 decimals (the projection is exact); engaged rows
      // carry an anchored-dive transient (the anchor-pivoted restore is
      // attenuated by the localUp chase — bounded, easing back), hence the
      // wider engaged bar. A world-armed zoom-in leg without this mapping
      // would deviate by up to 0.355 — remembered × w with nothing expressed.
      const bar = s.arm === 'abs' ? 0.01 : 0.09;
      expect(Math.abs(s.tilt - mappedTiltRad(remembered, s.hr, TUNING))).toBeLessThan(bar);
      // No threshold step: a notch may move tilt by ~the map's own delta — a
      // per-notch fraction of the band's log span, so it shrinks as the band
      // widens. A mapping expressed on the engaged arm only would instead step
      // by the whole memory at the flip.
      expect(Math.abs(s.tilt - prevTilt)).toBeLessThan(remembered * 0.3);
      prevTilt = s.tilt;
    }
    // The mapping really lerped back in (not "stayed 0 and never returned").
    expect(trace[trace.length - 1]!.tilt).toBeGreaterThan(0.8 * remembered);
  });
});
