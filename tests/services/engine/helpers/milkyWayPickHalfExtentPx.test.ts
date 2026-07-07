/**
 * milkyWayPickHalfExtentPx — the pick billboard must be sized for the
 * camera the pick pass actually renders with (`state.picking.lastFrameCam`)
 * and for the RENDERED disc radius (`MILKY_WAY_RADIUS_MPC`, the constant
 * that scales the star/dust cloud into the scene) — not the drag register
 * and not the larger selection-ring radius.  Reading the drag register was
 * the wheel-zoom bug: the hit target kept its old size until a drag
 * re-seeded `state.cam`, then snapped.
 */

import { describe, it, expect } from 'vitest';

import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { PickFrameCam } from '../../../../src/@types/engine/state/PickFrameCam';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { milkyWayPickHalfExtentPx } from '../../../../src/services/engine/helpers/milkyWayPickHalfExtentPx';
import { MILKY_WAY_RADIUS_MPC } from '../../../../src/services/gpu/galaxy/milkyWayCalibration';
import { MILKY_WAY_CENTER_WORLD } from '../../../../src/data/milkyWay/galacticCenter';

// Project-default vertical fov + a 720-px-tall backing store, matching the
// stub cameras the frame/pass tests use.
const FOV_Y_RAD = (60 * Math.PI) / 180;
const CANVAS_H = 720;
const PX_PER_RAD = CANVAS_H / (2 * Math.tan(FOV_Y_RAD / 2));

/**
 * A last-visual-frame camera exactly `distMpc` from the GALACTIC CENTRE
 * (the sizing formula's reference point), offset along +z.  The centre
 * sits ~8 kpc from the origin, so origin-keyed quantities (the fade band)
 * differ only negligibly at these distances.
 */
function frameCamAtCenterDist(distMpc: number): PickFrameCam {
  return {
    position: [
      MILKY_WAY_CENTER_WORLD[0],
      MILKY_WAY_CENTER_WORLD[1],
      MILKY_WAY_CENTER_WORLD[2] + distMpc,
    ] as Readonly<Vec3>,
    fovYRad: FOV_Y_RAD,
  };
}

/** Minimal EngineState: toggle on, no fade tail, snapshot + drag register. */
function makeState(opts: {
  lastFrameCam: PickFrameCam | null;
  dragRegisterPos?: Vec3;
  sizePx?: number;
}): EngineState {
  return {
    settings: {
      milkyWay: { enabled: true },
      galaxyCatalogs: { sizePx: opts.sizePx ?? 4 },
    },
    subsystems: {
      fades: { opacityOf: () => 0 },
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

describe('milkyWayPickHalfExtentPx', () => {
  it('returns null when lastFrameCam is null, even with a close drag-register pose', () => {
    // No stashed visual frame → no pick billboard, regardless of what the
    // drag register claims.  Proves state.cam is no longer an input.
    const state = makeState({
      lastFrameCam: null,
      dragRegisterPos: [0, 0, 0.2],
    });
    expect(milkyWayPickHalfExtentPx(state, CANVAS_H)).toBeNull();
  });

  it('sizes to MILKY_WAY_RADIUS_MPC at the lastFrameCam distance (exact formula)', () => {
    // The billboard half-extent is the rendered disc's bare apparent
    // radius: (R / camDist) * pxPerRad.  The drag register is planted at a
    // wildly different distance — the result must come from the snapshot.
    const camDist = 0.5;
    const state = makeState({
      lastFrameCam: frameCamAtCenterDist(camDist),
      dragRegisterPos: [0, 0, 100],
    });
    const expected = (MILKY_WAY_RADIUS_MPC / camDist) * PX_PER_RAD;
    expect(milkyWayPickHalfExtentPx(state, CANVAS_H)).toBeCloseTo(expected, 6);
  });

  it('scales inversely with the camera distance to the galactic centre', () => {
    // Halving the distance doubles the half-extent (both well above the
    // point-size floor, both inside the visibility band).
    const near = milkyWayPickHalfExtentPx(
      makeState({ lastFrameCam: frameCamAtCenterDist(0.5) }),
      CANVAS_H,
    );
    const far = milkyWayPickHalfExtentPx(
      makeState({ lastFrameCam: frameCamAtCenterDist(1.0) }),
      CANVAS_H,
    );
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!).toBeGreaterThan(far!);
    expect(near! / far!).toBeCloseTo(2, 5);
  });

  it('floors at settings.galaxyCatalogs.sizePx when the disc projects smaller', () => {
    // Distance chosen so the apparent radius is ~5 px — below the 6-px
    // floor but still inside the fade band (apparent DIAMETER ~10 px sits
    // between GONE=8 and FULL=12), so the disk is visible and the floor is
    // what keeps it clickable.
    const targetRadiusPx = 5;
    const camDist = (MILKY_WAY_RADIUS_MPC * PX_PER_RAD) / targetRadiusPx;
    const state = makeState({
      lastFrameCam: frameCamAtCenterDist(camDist),
      sizePx: 6,
    });
    expect(milkyWayPickHalfExtentPx(state, CANVAS_H)).toBe(6);
  });

  it('returns null once the disc has faded out entirely (gate folded in)', () => {
    // Far past the GONE band the visibility gate reports false, and the
    // helper folds that into a null size — the renderer draws nothing.
    const state = makeState({ lastFrameCam: frameCamAtCenterDist(50) });
    expect(milkyWayPickHalfExtentPx(state, CANVAS_H)).toBeNull();
  });
});
