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
import { SURFACE_REGIME } from '../../../../src/data/camera/surfaceRegime';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { BodyState } from '../../../../src/@types/scene/BodyState';

const EARTH = deriveBodyStates(CONST_J2000).get('earth')! as BodyState;
const EARTH_RADIUS_M = SCENE_EARTH.radiusM;

describe('tilt lerp round trip (ruling 13)', () => {
  it('display tilt tracks remembered × w through the window in BOTH directions', () => {
    const h = makeCameraSimHarness();

    // Dive to the surface regime.
    diveUntilEngaged(h);
    expect(h.state.cameraRuntime.lastPose.current.frame).not.toBe('absolute');

    // Set the memory through surfaceStep's own tilt/look drag steps. The
    // memory is session state and body-agnostic, so a unit-radius drag is
    // the same write path an engaged Earth drag takes — without hand-tuning
    // a metre-scale gesture through the whole input stack (the drag path
    // itself is pinned in rememberedTilt.test.ts). h/R 0.15 keeps the tilt
    // ceiling open under ruling 19's tighter band. 2 px look steps: the loop
    // exits on remembered ≥ 0.35, and the engaged bar below is calibrated
    // for landing NEAR 0.35 — the dive transient scales with the memory, so
    // a coarse last increment inflates it.
    seedRememberedTilt(h, { targetRad: 0.35, guard: 6, pxStep: 2 });

    // Converge the engaged display onto the memory before tracing.
    for (let i = 0; i < 12; i += 1) h.wheel(0.0001);
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
        arm: h.state.cameraRuntime.lastPose.current.frame === 'absolute' ? 'abs' : 'body',
      });
    };
    for (let i = 0; i < 22; i += 1) notch(100);
    expect(trace[trace.length - 1]!.hr).toBeGreaterThan(SURFACE_REGIME.disengageHR * 2); // genuinely out
    for (let i = 0; i < 26; i += 1) notch(-100);
    expect(trace[trace.length - 1]!.hr).toBeLessThan(SURFACE_REGIME.engageHR * 0.75); // genuinely back in

    let prevTilt = trace[0]!.tilt;
    for (const s of trace) {
      // The pure function, both arms, both directions. World-armed rows sit
      // on the map to 4 decimals (the projection is exact); engaged rows
      // carry an anchored-dive transient (the anchor-pivoted restore is
      // attenuated by the localUp chase — bounded, easing back), hence the
      // wider engaged bar. A world-armed zoom-in leg without this mapping
      // would deviate by up to 0.355 — remembered × w with nothing expressed.
      const bar = s.arm === 'abs' ? 0.01 : 0.09;
      expect(Math.abs(s.tilt - mappedTiltRad(remembered, s.hr))).toBeLessThan(bar);
      // No threshold step: a notch may move tilt by ~the map's own delta. A
      // wheel notch crosses ~14% of the band in log blend space while the band
      // keeps its 2× hysteresis (the fraction is 0.1 / ln(disengage/engage)),
      // i.e. ~0.094 rad here — nowhere near a real snap (a broken mapping
      // would run 0.1-0.355+).
      expect(Math.abs(s.tilt - prevTilt)).toBeLessThan(0.1);
      prevTilt = s.tilt;
    }
    // The mapping really lerped back in (not "stayed 0 and never returned").
    expect(trace[trace.length - 1]!.tilt).toBeGreaterThan(0.8 * remembered);
  });
});
