/**
 * milkyWayVisible — the ONE home of the MW visibility predicate, reached
 * through `milkyWayLayer.enabled`, which the draw program runs against the
 * frame camera and the pick program runs against the replayed pick camera.
 * These tests pin the predicate itself — the toggle/fade-tail gate and the
 * apparent-size fade band — against an injected camera and clock, the way
 * both programs use it (each hands in its own ctx camera + nowMs; the fade
 * registry is stubbed here so 0 works).
 */

import { describe, it, expect } from 'vitest';

import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { milkyWayVisible } from '../../../../src/services/engine/helpers/milkyWayVisible';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

// Project-default vertical fov + a 720-px-tall backing store, matching the
// stub cameras the frame/pass tests use.
const FOV_Y_RAD = (60 * Math.PI) / 180;
const CANVAS_H = 720;
const PX_PER_RAD = CANVAS_H / (2 * Math.tan(FOV_Y_RAD / 2));

// Fade-band camera distances derived from the calibration knobs (not
// hardcoded Mpc), so these tests survive visual-gate re-tunes of the band.
// Inverting apparentDiameterPx: the disc (diameter 2·R) spans exactly `px`
// on screen at distance 2·R·pxPerRad / px.
const FULL_DIST_MPC = (2 * MILKY_WAY_RADIUS_MPC * PX_PER_RAD) / MILKY_WAY_FADE_FULL_PX;
const GONE_DIST_MPC = (2 * MILKY_WAY_RADIUS_MPC * PX_PER_RAD) / MILKY_WAY_FADE_GONE_PX;

/** Camera position at `distMpc` from the origin, on +z. */
function camAt(distMpc: number): Readonly<Vec3> {
  return [0, 0, distMpc];
}

/** Minimal EngineState for the predicate: the MW toggle + fade registry. */
function makeState(opts: { mwEnabled?: boolean; fadeOpacity?: number }): EngineState {
  return {
    settings: { milkyWay: { enabled: opts.mwEnabled ?? true } },
    subsystems: { fades: { opacityOf: () => opts.fadeOpacity ?? 0 } },
  } as unknown as EngineState;
}

describe('milkyWayVisible', () => {
  it('returns false when the toggle is off and the fade tail has finished', () => {
    // Not drawn → not visible, no matter how close the camera is.
    const state = makeState({ mwEnabled: false, fadeOpacity: 0 });
    expect(milkyWayVisible(state, camAt(FULL_DIST_MPC / 2), FOV_Y_RAD, CANVAS_H, 0)).toBe(false);
  });

  it('returns true during the toggle fade-out tail (opacity > 0)', () => {
    // The disk is still drawing its ~100 ms fade-out ramp — the pass keeps
    // rendering and the pick gate keeps accepting through the tail.
    const state = makeState({ mwEnabled: false, fadeOpacity: 0.5 });
    expect(milkyWayVisible(state, camAt(FULL_DIST_MPC / 2), FOV_Y_RAD, CANVAS_H, 0)).toBe(true);
  });

  it('resolves the apparent-size fade band from the injected camera', () => {
    const state = makeState({ mwEnabled: true });
    // Inside the full-strength regime: disc spans more than FULL_PX.
    expect(milkyWayVisible(state, camAt(FULL_DIST_MPC / 2), FOV_Y_RAD, CANVAS_H, 0)).toBe(true);
    // Past the GONE edge: the disc spans fewer px than GONE_PX → alpha 0.
    expect(milkyWayVisible(state, camAt(GONE_DIST_MPC * 2), FOV_Y_RAD, CANVAS_H, 0)).toBe(false);
    // Mid-band: alpha is fractional but nonzero → still visible.
    const midDist = (FULL_DIST_MPC + GONE_DIST_MPC) / 2;
    expect(milkyWayVisible(state, camAt(midDist), FOV_Y_RAD, CANVAS_H, 0)).toBe(true);
  });

  it('derives the origin distance from the full 3D camera position', () => {
    // Same distance split across axes must land in the same band — the
    // predicate owns the hypot, so callers pass a position, not a distance.
    const state = makeState({ mwEnabled: true });
    const d = FULL_DIST_MPC / 2;
    const diag = d / Math.sqrt(3);
    expect(milkyWayVisible(state, [diag, diag, diag], FOV_Y_RAD, CANVAS_H, 0)).toBe(true);
  });
});
