/**
 * applyInputToCamera — the orbit / pan / zoom math the frame's drain runs.
 *
 * Two things worth pinning: the aggregated net delta must produce the same
 * pose the old per-event apply did (the whole premise of collapsing a frame's
 * moves), and the pivot radius must reach both rate and zoom-floor sites — drop
 * it and the camera silently sweeps a third of a screen per pixel, or scrolls
 * straight through the planet.
 */

import { describe, it, expect } from 'vitest';

import { applyInputToCamera } from '../../../src/services/camera/applyInputToCamera';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { MIN_DISTANCE_MPC, SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';
import type { PivotFraming } from '../../../src/@types/camera/PivotFraming';
import type { Vec2 } from '../../../src/@types/math/Vec2';

/** Earth's mean radius (km → Mpc) — the pivot radius for the zoom-floor cases. */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

const NO_PIVOT: PivotFraming = { radiusMpc: null, floorMpc: MIN_DISTANCE_MPC };
const EARTH_PIVOT: PivotFraming = {
  radiusMpc: EARTH_RADIUS_MPC,
  floorMpc: EARTH_RADIUS_MPC * SURFACE_STANDOFF_RADII,
};

const CSS_HEIGHT = 1000;

function makeCamera(): OrbitCamera {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance: 100,
    yaw: 0,
    pitch: 0,
    fovYRad: (Math.PI / 180) * 60,
    aspect: 1,
    near: 0.1,
    far: 1000,
  });
}

const drag = (startPx: Vec2, endPx: Vec2, mode: 'orbit' | 'pan' = 'orbit') =>
  ({ kind: 'drag', mode, startPx, endPx }) as const;

describe('applyInputToCamera — orbit', () => {
  it('yaws by exactly the flat dx * 0.005 with no pivot to damp against', () => {
    // The deep-space / unfocused path: null pivot ⇒ orbitRadPerPixel returns the
    // flat cap unchanged.
    const cam = makeCamera();
    applyInputToCamera(cam, drag([100, 100], [150, 100]), CSS_HEIGHT, NO_PIVOT);

    // Drag right (+50 px) → yaw DECREASES (globe drag).
    expect(cam.yaw).toBeCloseTo(-50 * 0.005, 6);
  });

  it('a frame of small moves lands where one move of the net delta lands', () => {
    // The aggregation premise: within a run the rate is constant (it derives
    // from distance, which orbit does not touch), so the sum is the net.
    const stepped = makeCamera();
    let px = 100;
    for (const next of [110, 130, 165]) {
      applyInputToCamera(stepped, drag([px, 100], [next, 100]), CSS_HEIGHT, EARTH_PIVOT);
      px = next;
    }

    const collapsed = makeCamera();
    applyInputToCamera(collapsed, drag([100, 100], [165, 100]), CSS_HEIGHT, EARTH_PIVOT);

    expect(collapsed.yaw).toBeCloseTo(stepped.yaw, 12);
    expect(collapsed.pitch).toBeCloseTo(stepped.pitch, 12);
  });

  it('the same drag yaws far less near a surface than far from the same pivot', () => {
    // The flat rate rotates about the pivot's CENTRE, so the ground it sweeps
    // scales with the pivot's radius regardless of how far the camera is from
    // that ground. `orbitRadPerPixel` damps the rate at low altitude.
    const near = makeCamera();
    near.distance = EARTH_RADIUS_MPC * 1.02; // ~127 km altitude
    applyInputToCamera(near, drag([100, 100], [150, 100]), CSS_HEIGHT, EARTH_PIVOT);

    const far = makeCamera();
    far.distance = EARTH_RADIUS_MPC * 1000;
    applyInputToCamera(far, drag([100, 100], [150, 100]), CSS_HEIGHT, EARTH_PIVOT);

    // Far above the surface the damping term has not engaged.
    expect(far.yaw).toBeCloseTo(-50 * 0.005, 4);
    expect(Math.abs(near.yaw)).toBeLessThan(Math.abs(far.yaw) / 50);
  });

  it('clamps pitch off the pole rather than reaching gimbal lock', () => {
    const cam = makeCamera();
    applyInputToCamera(cam, drag([0, 0], [0, 100000]), CSS_HEIGHT, NO_PIVOT);

    expect(cam.pitch).toBeCloseTo(Math.PI / 2 - 0.01, 12);
    expect(Number.isFinite(cam.position[0])).toBe(true);
  });
});

describe('applyInputToCamera — pan', () => {
  it('shifts the target across the image plane and leaves the orbit terms alone', () => {
    // Pan owns the pivot only — the orbit terms belong to whatever produced the
    // pose, and a pan that touched them would fight every other driver.
    const cam = makeCamera();
    const beforeYaw = cam.yaw;
    const beforePitch = cam.pitch;
    applyInputToCamera(cam, drag([100, 100], [150, 100], 'pan'), CSS_HEIGHT, NO_PIVOT);

    expect(cam.yaw).toBe(beforeYaw);
    expect(cam.pitch).toBe(beforePitch);
    expect(cam.distance).toBe(100);
    // Dragging right slides the target the other way (grab-and-pull).
    expect(Math.hypot(...cam.target)).toBeGreaterThan(0);
  });
});

describe('applyInputToCamera — zoom floor at a focused body’s surface', () => {
  it('stops just outside the surface however hard the user zooms in', () => {
    // The absolute floor is 0.048 Earth radii, so without the pivot radius a
    // zoom-in walks the camera thousands of km under the crust.
    const cam = makeCamera();
    cam.distance = EARTH_RADIUS_MPC * 4;

    applyInputToCamera(
      cam,
      { kind: 'zoom', factor: 1 / 1e6, duringGesture: true, cursorPx: null },
      CSS_HEIGHT,
      EARTH_PIVOT,
    );

    const radii = cam.distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });
});
