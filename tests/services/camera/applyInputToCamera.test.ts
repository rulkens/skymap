/**
 * applyInputToCamera — the orbit / pan / zoom fold the frame's drain runs.
 *
 * Two things worth pinning: the aggregated net delta must produce the same
 * pose the old per-event apply did (the whole premise of collapsing a frame's
 * moves), and the pivot radius must reach both rate and zoom-floor sites — drop
 * it and the camera silently sweeps a third of a screen per pixel, or scrolls
 * straight through the planet.
 */

import { describe, it, expect } from 'vitest';

import { applyInputToCamera } from '../../../src/services/camera/applyInputToCamera';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { MIN_DISTANCE_MPC, SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { PivotFraming } from '../../../src/@types/camera/PivotFraming';
import type { InputStep } from '../../../src/@types/camera/InputStep';
import type { Vec2 } from '../../../src/@types/math/Vec2';

/** Earth's mean radius (km → Mpc) — the pivot radius for the zoom-floor cases. */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

const NO_PIVOT: PivotFraming = { radiusMpc: null, floorMpc: MIN_DISTANCE_MPC };
const EARTH_PIVOT: PivotFraming = {
  radiusMpc: EARTH_RADIUS_MPC,
  floorMpc: EARTH_RADIUS_MPC * SURFACE_STANDOFF_RADII,
};

const CSS_HEIGHT = 1000;
const FOV_Y_RAD = (Math.PI / 180) * 60;
const B = ORIENTATION_FRAMES.ecliptic;

function makePose(): CameraPose {
  return { target: [0, 0, 0], distance: 100, yaw: 0, pitch: 0 };
}

/** Fold one step over `pose` with the fixture's projection + bases. */
function fold(
  pose: CameraPose,
  step: Extract<InputStep, { kind: 'drag' } | { kind: 'zoom' }>,
  pivot: PivotFraming,
): CameraPose {
  return applyInputToCamera(pose, step, CSS_HEIGHT, pivot, FOV_Y_RAD, B, B);
}

const drag = (startPx: Vec2, endPx: Vec2, mode: 'orbit' | 'pan' = 'orbit') =>
  ({ kind: 'drag', mode, startPx, endPx }) as const;

describe('applyInputToCamera — orbit', () => {
  it('yaws by exactly the flat dx * 0.005 with no pivot to damp against', () => {
    // The deep-space / unfocused path: null pivot ⇒ orbitRadPerPixel returns the
    // flat cap unchanged.
    const next = fold(makePose(), drag([100, 100], [150, 100]), NO_PIVOT);

    // Drag right (+50 px) → yaw DECREASES (globe drag).
    expect(next.yaw).toBeCloseTo(-50 * 0.005, 6);
  });

  it('a frame of small moves lands where one move of the net delta lands', () => {
    // The aggregation premise: within a run the rate is constant (it derives
    // from distance, which orbit does not touch), so the sum is the net.
    let stepped = makePose();
    let px = 100;
    for (const next of [110, 130, 165]) {
      stepped = fold(stepped, drag([px, 100], [next, 100]), EARTH_PIVOT);
      px = next;
    }

    const collapsed = fold(makePose(), drag([100, 100], [165, 100]), EARTH_PIVOT);

    expect(collapsed.yaw).toBeCloseTo(stepped.yaw, 12);
    expect(collapsed.pitch).toBeCloseTo(stepped.pitch, 12);
  });

  it('the same drag yaws far less near a surface than far from the same pivot', () => {
    // The flat rate rotates about the pivot's CENTRE, so the ground it sweeps
    // scales with the pivot's radius regardless of how far the camera is from
    // that ground. `orbitRadPerPixel` damps the rate at low altitude.
    const near = fold(
      { ...makePose(), distance: EARTH_RADIUS_MPC * 1.02 }, // ~127 km altitude
      drag([100, 100], [150, 100]),
      EARTH_PIVOT,
    );

    const far = fold(
      { ...makePose(), distance: EARTH_RADIUS_MPC * 1000 },
      drag([100, 100], [150, 100]),
      EARTH_PIVOT,
    );

    // Far above the surface the damping term has not engaged.
    expect(far.yaw).toBeCloseTo(-50 * 0.005, 4);
    expect(Math.abs(near.yaw)).toBeLessThan(Math.abs(far.yaw) / 50);
  });

  it('clamps pitch off the pole rather than reaching gimbal lock', () => {
    const next = fold(makePose(), drag([0, 0], [0, 100000]), NO_PIVOT);

    expect(next.pitch).toBeCloseTo(Math.PI / 2 - 0.01, 12);
  });
});

describe('applyInputToCamera — pan', () => {
  it('shifts the target across the image plane and leaves the orbit terms alone', () => {
    // Pan owns the pivot only — the orbit terms belong to whatever produced the
    // pose, and a pan that touched them would fight every other driver.
    const before = makePose();
    const next = fold(before, drag([100, 100], [150, 100], 'pan'), NO_PIVOT);

    expect(next.yaw).toBe(before.yaw);
    expect(next.pitch).toBe(before.pitch);
    expect(next.distance).toBe(100);
    // Dragging right slides the target the other way (grab-and-pull).
    expect(Math.hypot(...next.target)).toBeGreaterThan(0);
    // Pure fold: the input pose is untouched.
    expect(before.target).toEqual([0, 0, 0]);
  });
});

describe('applyInputToCamera — zoom floor at a focused body’s surface', () => {
  it('stops just outside the surface however hard the user zooms in', () => {
    // The absolute floor is 0.048 Earth radii, so without the pivot radius a
    // zoom-in walks the camera thousands of km under the crust.
    const next = fold(
      { ...makePose(), distance: EARTH_RADIUS_MPC * 4 },
      { kind: 'zoom', factor: 1 / 1e6, duringGesture: true, cursorPx: null },
      EARTH_PIVOT,
    );

    const radii = next.distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });
});
