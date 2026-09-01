/**
 * applyWheelZoom — routing a discrete wheel-zoom factor to the right distance
 * owner.
 *
 * The load-bearing case is zoom-WHILE-FOLLOWING: with a body focused the
 * followBody driver owns the pose distance (via `clock.followDistanceTarget`),
 * and the resting driver that renders `camera.base` is NOT the winner. A commit
 * into `base` is therefore invisible and re-asserted away every frame — the zoom
 * gets swallowed. `applyWheelZoom` fixes that by scaling the follow's own target
 * in place when follow is the active owner, and committing `base` otherwise.
 */

import { describe, it, expect } from 'vitest';

import { applyWheelZoom } from '../../../../src/services/engine/camera/applyWheelZoom';
import {
  createCameraClock,
  autoRotateElapsed,
} from '../../../../src/services/engine/camera/cameraClock';
import {
  MIN_DISTANCE_MPC,
  MAX_DISTANCE_MPC,
  SURFACE_STANDOFF_RADII,
} from '../../../../src/utils/camera/clampDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { PivotFraming } from '../../../../src/@types/camera/PivotFraming';

const BASE: CameraPose = { target: [0, 0, 0], yaw: 1, pitch: 0.2, distance: 100 };
const FRAME_MS = 1000 / 60;
const SPIN_OFF = { active: false, rate: 0 };
/** Earth's mean radius (km → Mpc) — the pivot radius for the surface-floor case. */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;
/** No focused pivot — the absolute floor, no taper anchor. */
const NO_PIVOT: PivotFraming = { radiusMpc: null, floorMpc: MIN_DISTANCE_MPC };
/** The bundle a resolved Earth focus row resolves to (`pivotFraming`, no override). */
const EARTH_PIVOT: PivotFraming = {
  radiusMpc: EARTH_RADIUS_MPC,
  floorMpc: EARTH_RADIUS_MPC * SURFACE_STANDOFF_RADII,
};

describe('applyWheelZoom', () => {
  it('scales the follow distance target in place while following (zoom is not swallowed)', () => {
    // Follow is the active winner (prevActiveId 'followBody') with a seeded
    // distance target. A wheel-out factor > 1 must GROW the follow target, not
    // the (invisible) base — this is the whole bug: pre-fix the wheel committed
    // base and the follow driver ignored it.
    const clock = createCameraClock();
    clock.followDistanceTarget = 50;

    const result = applyWheelZoom(clock, 'followBody', BASE, 1.2, SPIN_OFF, 0, NO_PIVOT);

    expect(result).toBeNull(); // nothing to commit into the store
    expect(clock.followDistanceTarget).toBeCloseTo(60, 9); // 50 * 1.2
  });

  it('clamps the scaled follow target to the shared zoom envelope', () => {
    const clock = createCameraClock();
    clock.followDistanceTarget = MAX_DISTANCE_MPC;
    applyWheelZoom(clock, 'followBody', BASE, 1000, SPIN_OFF, 0, NO_PIVOT);
    expect(clock.followDistanceTarget).toBe(MAX_DISTANCE_MPC);
  });

  it('floors the follow target at the focused body’s surface, not the absolute floor', () => {
    // Zoom-in while following Earth: the follow driver owns the distance, so the
    // per-pivot floor has to be applied HERE or the wheel walks the target inside
    // the planet (the absolute floor is 0.048 Earth radii). A factor small enough
    // to blow through the surface in one tick makes the arm's clamp the only thing
    // standing between the camera and the mantle.
    const clock = createCameraClock();
    clock.followDistanceTarget = EARTH_RADIUS_MPC * 4;
    applyWheelZoom(clock, 'followBody', BASE, 1e-6, SPIN_OFF, 0, EARTH_PIVOT);

    const radii = clock.followDistanceTarget! / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });

  it('commits the zoomed base when the resting driver owns the distance', () => {
    const clock = createCameraClock();
    const result = applyWheelZoom(clock, 'resting', BASE, 2, SPIN_OFF, 0, NO_PIVOT);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(200, 9); // 100 * 2
    // The follow target is untouched — resting reads base, not the follow clock.
    expect(clock.followDistanceTarget).toBeNull();
  });

  it('folds the accumulated spin into the committed base under an active auto-rotate', () => {
    // autoRotate renders `spinAutoRotate(base, rate, elapsed)`. A wheel zoom must
    // commit the ALREADY-spun yaw, else installing a fresh base with the un-spun
    // yaw resets the elapsed clock and the rendered yaw snaps back — the pop.
    // Old code returned `zoomedPose(base, factor)` with yaw === base.yaw; this
    // case fails against it because we assert the spun yaw.
    const clock = createCameraClock();
    const rate = 0.01;
    // Install the auto-rotate start at t=0 (mirrors the driver's first read),
    // then read elapsed at t=500ms — the same read the wheel handler performs.
    autoRotateElapsed(clock, true, BASE, 0);
    const result = applyWheelZoom(
      clock,
      'autoRotate',
      BASE,
      0.5,
      { active: true, rate },
      500,
      NO_PIVOT,
    );

    expect(result).not.toBeNull();
    // yaw = base.yaw + rate * (elapsedMs / FRAME_MS), elapsedMs = 500.
    expect(result!.yaw).toBeCloseTo(BASE.yaw + rate * (500 / FRAME_MS), 9);
    expect(result!.distance).toBeCloseTo(50, 9); // 100 * 0.5
  });

  it('commits the plain zoomed base when auto-rotate is inactive between frames', () => {
    // prevActiveId still reads 'autoRotate' from last frame but the spin was
    // switched off; elapsed reads 0, so the branch degrades to the un-spun base.
    const clock = createCameraClock();
    const result = applyWheelZoom(
      clock,
      'autoRotate',
      BASE,
      0.5,
      { active: false, rate: 0.01 },
      500,
      NO_PIVOT,
    );
    expect(result).not.toBeNull();
    expect(result!.yaw).toBe(BASE.yaw); // no spin folded in
    expect(result!.distance).toBeCloseTo(50, 9); // 100 * 0.5
  });

  it('falls back to a base commit in the one-frame window before the follow target is seeded', () => {
    // prevActiveId says followBody but the driver has not run its pose yet to
    // seed the target (null). Committing base is harmless: the approach re-seeds
    // the framing distance on its first produce.
    const clock = createCameraClock();
    clock.followDistanceTarget = null;
    const result = applyWheelZoom(clock, 'followBody', BASE, 1.1, SPIN_OFF, 0, NO_PIVOT);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(110, 9);
  });
});
