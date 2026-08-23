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
import { MAX_DISTANCE_MPC, MIN_DISTANCE_MPC } from '../../../../src/utils/camera/clampDistance';
import type { ZoomStep } from '../../../../src/@types/camera/ZoomStep';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

const BASE: CameraPose = { target: [0, 0, 0], yaw: 1, pitch: 0.2, distance: 100 };
const FRAME_MS = 1000 / 60;
const SPIN_OFF = { active: false, rate: 0 };
/** A centred tick — the lateral half is the caller's job to route (see wireInput). */
const zoom = (
  distanceScale: number,
  lateralMpc: [number, number, number] = [0, 0, 0],
): ZoomStep => ({
  distanceScale,
  lateralMpc,
});
/** Earth's mean radius (km → Mpc) — the pivot radius for the surface-floor case. */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

describe('applyWheelZoom', () => {
  it('scales the follow distance target in place while following (zoom is not swallowed)', () => {
    // Follow is the active winner (prevActiveId 'followBody') with a seeded
    // distance target. A wheel-out factor > 1 must GROW the follow target, not
    // the (invisible) base — this is the whole bug: pre-fix the wheel committed
    // base and the follow driver ignored it.
    const clock = createCameraClock();
    clock.followDistanceTarget = 50;

    const result = applyWheelZoom(clock, 'followBody', BASE, zoom(1.2), SPIN_OFF, 0);

    expect(result).toBeNull(); // nothing to commit into the store
    expect(clock.followDistanceTarget).toBeCloseTo(60, 9); // 50 * 1.2
  });

  it('clamps the scaled follow target to the shared zoom envelope', () => {
    const clock = createCameraClock();
    clock.followDistanceTarget = MAX_DISTANCE_MPC;
    applyWheelZoom(clock, 'followBody', BASE, zoom(1000), SPIN_OFF, 0);
    expect(clock.followDistanceTarget).toBe(MAX_DISTANCE_MPC);
  });

  it('does NOT re-floor the follow target at the body’s radius — only the envelope', () => {
    // The surface stop is upstream, in eye currency (`zoomedEyeStep`), because
    // `distance` is measured to a pivot that a zoom-to-cursor tick strafes off
    // the body centre. Re-applying it here in DISTANCE currency walls the zoom:
    // once the target sits on `radius · STANDOFF`, every further tick returns
    // that same value and the wheel goes dead while the pivot slides sideways.
    const clock = createCameraClock();
    clock.followDistanceTarget = EARTH_RADIUS_MPC * 4;
    applyWheelZoom(clock, 'followBody', BASE, zoom(1e-6), SPIN_OFF, 0);

    expect(clock.followDistanceTarget!).toBeLessThan(EARTH_RADIUS_MPC);
    // Still strictly positive: a pivot that strafes past the eye is the one
    // degeneracy the envelope's floor is here to catch.
    expect(clock.followDistanceTarget!).toBe(MIN_DISTANCE_MPC);
  });

  it('commits the zoomed base when the resting driver owns the distance', () => {
    const clock = createCameraClock();
    const result = applyWheelZoom(clock, 'resting', BASE, zoom(2), SPIN_OFF, 0);
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
      zoom(0.5),
      { active: true, rate },
      500,
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
      zoom(0.5),
      { active: false, rate: 0.01 },
      500,
    );
    expect(result).not.toBeNull();
    expect(result!.yaw).toBe(BASE.yaw); // no spin folded in
    expect(result!.distance).toBeCloseTo(50, 9); // 100 * 0.5
  });

  it('carries the tick’s lateral onto the committed pose’s target (a static focus keeps it)', () => {
    // Zoom-to-cursor moves the pivot sideways as well as in/out. For a pivot the
    // frame loop does NOT pin (a static focus), the committed target is the only
    // place that shift can live — the follow arm below drops it precisely
    // because following implies a pinned body, whose lateral the caller has
    // already put on `clock.followPanStored`.
    const clock = createCameraClock();
    const result = applyWheelZoom(
      clock,
      'resting',
      BASE,
      zoom(0.5, [3, -4, 12]),
      SPIN_OFF,
      0,
    );
    expect(result!.target).toEqual([3, -4, 12]);
    expect(result!.yaw).toBe(BASE.yaw);
    expect(result!.pitch).toBe(BASE.pitch);
  });

  it('falls back to a base commit in the one-frame window before the follow target is seeded', () => {
    // prevActiveId says followBody but the driver has not run its pose yet to
    // seed the target (null). Committing base is harmless: the approach re-seeds
    // the framing distance on its first produce.
    const clock = createCameraClock();
    clock.followDistanceTarget = null;
    const result = applyWheelZoom(clock, 'followBody', BASE, zoom(1.1), SPIN_OFF, 0);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(110, 9);
  });
});
