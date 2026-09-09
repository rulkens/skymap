/**
 * applyWheelZoom — routing a discrete wheel-zoom factor to the right distance
 * owner. The load-bearing case is zoom-WHILE-FOLLOWING: with a body focused
 * the followBody driver owns the pose distance (the follow memory's
 * `distanceTarget`) and the resting driver that renders `camera.base` is NOT
 * the winner, so a commit into `base` is invisible and re-asserted away every
 * frame — the zoom gets swallowed. `applyWheelZoom` scales the follow's own
 * target instead when follow is the active owner, and commits `base` otherwise.
 */

import { describe, it, expect } from 'vitest';

import { applyWheelZoom } from '../../../../src/services/engine/camera/applyWheelZoom';
import {
  MIN_DISTANCE_MPC,
  MAX_DISTANCE_MPC,
  SURFACE_STANDOFF_RADII,
} from '../../../../src/utils/camera/clampDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraRuntime } from '../../../../src/@types/engine/state/CameraRuntime';
import type { PivotFraming } from '../../../../src/@types/camera/PivotFraming';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';

const BASE_POSE: CameraPose = { target: [0, 0, 0], yaw: 1, pitch: 0.2, distance: 100 };
const BASE = absoluteArm(BASE_POSE);
const FRAME_MS = 1000 / 60;
/** Earth's mean radius (km → Mpc) — the pivot radius for the surface-floor case. */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;
/** No focused pivot — the absolute floor, no taper anchor. */
const NO_PIVOT: PivotFraming = { radiusMpc: null, floorMpc: MIN_DISTANCE_MPC };
/** The bundle a resolved Earth focus row resolves to (`pivotFraming`, no override). */
const EARTH_PIVOT: PivotFraming = {
  radiusMpc: EARTH_RADIUS_MPC,
  floorMpc: EARTH_RADIUS_MPC * SURFACE_STANDOFF_RADII,
};

/** A runtime whose follow memory holds `distanceTarget` (the only field the wheel reads). */
function following(distanceTarget: number | null): Pick<CameraRuntime, 'follow'> {
  return { follow: { from: null, distanceTarget, panOffset: [0, 0, 0] } };
}

describe('applyWheelZoom', () => {
  it('scales the follow distance target in place while following (zoom is not swallowed)', () => {
    // Follow is the active winner (prevActiveId 'followBody') with a seeded
    // distance target. A wheel-out factor > 1 must GROW the follow target, not
    // the base — committing base while following is invisible, since the
    // follow driver ignores it and re-asserts its own target every frame.
    const runtime = following(50);

    const result = applyWheelZoom(runtime, 'followBody', BASE, 1.2, 0, 0, NO_PIVOT);

    expect(result).toBeNull(); // nothing to commit into the store
    expect(runtime.follow!.distanceTarget).toBeCloseTo(60, 9); // 50 * 1.2
  });

  it('clamps the scaled follow target to the shared zoom envelope', () => {
    const runtime = following(MAX_DISTANCE_MPC);
    applyWheelZoom(runtime, 'followBody', BASE, 1000, 0, 0, NO_PIVOT);
    expect(runtime.follow!.distanceTarget).toBe(MAX_DISTANCE_MPC);
  });

  it('floors the follow target at the focused body’s surface, not the absolute floor', () => {
    // Zoom-in while following Earth: the follow driver owns the distance, so the
    // per-pivot floor has to be applied HERE or the wheel walks the target inside
    // the planet (the absolute floor is 0.048 Earth radii). A factor small enough
    // to blow through the surface in one tick makes the arm's clamp the only thing
    // standing between the camera and the mantle.
    const runtime = following(EARTH_RADIUS_MPC * 4);
    applyWheelZoom(runtime, 'followBody', BASE, 1e-6, 0, 0, EARTH_PIVOT);

    const radii = runtime.follow!.distanceTarget! / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });

  it('commits the zoomed base when the resting driver owns the distance', () => {
    const runtime: Pick<CameraRuntime, 'follow'> = { follow: null };
    const result = applyWheelZoom(runtime, 'resting', BASE, 2, 0, 0, NO_PIVOT);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(200, 9); // 100 * 2
    // The follow memory is untouched — resting reads base, not the follow target.
    expect(runtime.follow).toBeNull();
  });

  it('folds the accumulated spin into the committed base under an active auto-rotate', () => {
    // autoRotate renders `spinAutoRotate(base, rate, elapsed)`. A wheel zoom must
    // commit the ALREADY-spun yaw, else installing a fresh base with the un-spun
    // yaw resets the spin epoch and the rendered yaw snaps back — the pop. The
    // caller hands in the spin epoch's elapsed at the wheel instant (500 ms).
    const rate = 0.01;
    const result = applyWheelZoom({ follow: null }, 'autoRotate', BASE, 0.5, rate, 500, NO_PIVOT);

    expect(result).not.toBeNull();
    // yaw = base.yaw + rate * (elapsedMs / FRAME_MS), elapsedMs = 500.
    expect(result!.yaw).toBeCloseTo(BASE_POSE.yaw + rate * (500 / FRAME_MS), 9);
    expect(result!.distance).toBeCloseTo(50, 9); // 100 * 0.5
  });

  it('falls back to a base commit in the one-frame window before the follow target is seeded', () => {
    // prevActiveId says followBody but the driver has not run its pose yet to
    // seed the target (null). Committing base is harmless: the approach re-seeds
    // the framing distance on its first produce.
    const result = applyWheelZoom(following(null), 'followBody', BASE, 1.1, 0, 0, NO_PIVOT);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(110, 9);
  });
});
