/**
 * milkyWayPickVisible — the pick gate must answer for the camera the pick
 * pass actually renders with (`state.picking.lastFrameCam`, stashed by the
 * point-sprites pass), never the `state.cam` drag register.  The drag
 * register only re-seeds when a drag starts, so a gate reading it goes
 * stale under driver-driven motion (wheel zoom, tweens).  Several cases
 * below deliberately plant a CONTRADICTORY drag-register pose to prove the
 * helper ignores it.
 */

import { describe, it, expect } from 'vitest';

import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { PickFrameCam } from '../../../../src/@types/engine/state/PickFrameCam';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { milkyWayPickVisible } from '../../../../src/services/engine/helpers/milkyWayPickVisible';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../src/services/gpu/galaxy/milkyWayCalibration';

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

/** A last-visual-frame camera snapshot at `distMpc` from the origin, on +z. */
function frameCamAt(distMpc: number): PickFrameCam {
  return { position: [0, 0, distMpc] as Readonly<Vec3>, fovYRad: FOV_Y_RAD };
}

/**
 * Minimal EngineState for the gate: the MW toggle, the fade registry, the
 * picking snapshot, and a drag-register `cam` the helper must NOT read.
 */
function makeState(opts: {
  lastFrameCam: PickFrameCam | null;
  dragRegisterPos?: Vec3;
  mwEnabled?: boolean;
  fadeOpacity?: number;
}): EngineState {
  return {
    settings: {
      milkyWay: { enabled: opts.mwEnabled ?? true },
      galaxyCatalogs: { sizePx: 4 },
    },
    subsystems: {
      fades: { opacityOf: () => opts.fadeOpacity ?? 0 },
    },
    picking: {
      pickInFlight: false,
      pointerDown: false,
      lastFrameUniformBytes: null,
      lastFrameCam: opts.lastFrameCam,
    },
    cam: opts.dragRegisterPos ? { position: opts.dragRegisterPos, fovYRad: FOV_Y_RAD } : null,
  } as unknown as EngineState;
}

describe('milkyWayPickVisible', () => {
  it('returns false when lastFrameCam is null, even with a close drag-register pose', () => {
    // No visual frame has been stashed yet → nothing to pick against.
    // The drag register holds a pose that WOULD pass every gate — proving
    // the helper no longer reads state.cam.
    const state = makeState({
      lastFrameCam: null,
      dragRegisterPos: [0, 0, FULL_DIST_MPC / 2],
    });
    expect(milkyWayPickVisible(state, CANVAS_H)).toBe(false);
  });

  it('derives the fade band from lastFrameCam, not the drag register', () => {
    // Snapshot camera far past the GONE band; drag register close-in.
    // The rendered frame the pick replays saw a vanished disc → false.
    const far = makeState({
      lastFrameCam: frameCamAt(GONE_DIST_MPC * 2),
      dragRegisterPos: [0, 0, FULL_DIST_MPC / 2],
    });
    expect(milkyWayPickVisible(far, CANVAS_H)).toBe(false);

    // Converse: snapshot close-in, drag register far out → true.
    const near = makeState({
      lastFrameCam: frameCamAt(FULL_DIST_MPC / 2),
      dragRegisterPos: [0, 0, GONE_DIST_MPC * 2],
    });
    expect(milkyWayPickVisible(near, CANVAS_H)).toBe(true);
  });

  it('returns true within the fade band when the toggle is on', () => {
    const state = makeState({ lastFrameCam: frameCamAt(FULL_DIST_MPC / 2) });
    expect(milkyWayPickVisible(state, CANVAS_H)).toBe(true);
  });

  it('returns false when the toggle is off and the fade tail has finished', () => {
    // Toggle off + fade opacity 0 → not drawn, so never pickable, no
    // matter how close the rendered camera was.
    const state = makeState({
      lastFrameCam: frameCamAt(FULL_DIST_MPC / 2),
      mwEnabled: false,
      fadeOpacity: 0,
    });
    expect(milkyWayPickVisible(state, CANVAS_H)).toBe(false);
  });

  it('returns true during the toggle fade-out tail (opacity > 0)', () => {
    // The disk is still drawing its ~100 ms fade-out ramp — a click during
    // the tail must still land, mirroring milkyWayPass.enabled.
    const state = makeState({
      lastFrameCam: frameCamAt(FULL_DIST_MPC / 2),
      mwEnabled: false,
      fadeOpacity: 0.5,
    });
    expect(milkyWayPickVisible(state, CANVAS_H)).toBe(true);
  });
});
