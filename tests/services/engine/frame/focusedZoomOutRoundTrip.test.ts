/**
 * focusedZoomOutRoundTrip — a wall-clock-faithful `runFrame` loop (real
 * drivers, follow ease, fold, drain; GPU mocked at the ready gate): Earth
 * focused, zoom IN through engage, zoom OUT to deep space at a fast cadence.
 * The engaged settle's band-blended reference must hand the fold a
 * scene-aligned screen-up at disengage, or the far-field roll freezes at
 * whatever scene roll accumulated in the band (up to 14.85°, `−0.2592` rad)
 * instead of returning to the configured scene up.
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
import { driveWheelEvents } from '../../../helpers/camera/driveWheelEvents';
import { hrOverBody } from '../../../helpers/camera/hrOverBody';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraSimHarness } from '../../../helpers/camera/CameraSimHarness';

const EARTH = deriveBodyStates(CONST_J2000).get('earth')! as BodyState;
const EARTH_RADIUS_M = SCENE_EARTH.radiusM;

/** 16 ms frames from 0..endT, wheel notches injected at their timestamps. */
function runLoop(
  h: CameraSimHarness,
  events: readonly { t: number; deltaY: number }[],
  endT: number,
): { hr: number; roll: number; arm: string } {
  driveWheelEvents(h, events, endT);
  return {
    hr: hrOverBody(h.state, EARTH, EARTH_RADIUS_M),
    roll: liveWorldPose(h.state).roll ?? 0,
    arm: h.state.cameraRuntime.lastPose.current.frame === 'absolute' ? 'abs' : 'body',
  };
}

describe('focused zoom-out round trip (round 5)', () => {
  it('engage → surface → recede → disengage lands the scene roll at ~0 (fast 33 ms)', () => {
    const h = makeCameraSimHarness();
    const events: { t: number; deltaY: number }[] = [];
    let t = 1000; // the follow approach settles at the framing distance first
    for (let i = 0; i < 20; i += 1, t += 33) events.push({ t, deltaY: -100 }); // in, engages
    t += 500;
    for (let i = 0; i < 30; i += 1, t += 33) events.push({ t, deltaY: 100 }); // out, disengages
    const end = runLoop(h, events, t + 1000);

    expect(end.arm).toBe('abs');
    expect(end.hr).toBeGreaterThan(4); // genuinely out of the band
    expect(Math.abs(end.roll)).toBeLessThan(1e-4);
  });

  it('the never-engaged control keeps the world-arm ride exact (S2)', () => {
    const h = makeCameraSimHarness();
    const events: { t: number; deltaY: number }[] = [];
    let t = 1000;
    for (let i = 0; i < 4; i += 1, t += 33) events.push({ t, deltaY: -100 }); // stays above engage
    t += 500;
    for (let i = 0; i < 25; i += 1, t += 33) events.push({ t, deltaY: 100 });
    const end = runLoop(h, events, t + 1000);

    expect(end.arm).toBe('abs');
    // ~2.5e-5 rad (0.0014°): the world ride's own decay tail, negligible here.
    expect(Math.abs(end.roll)).toBeLessThan(1e-4);
  });
});
