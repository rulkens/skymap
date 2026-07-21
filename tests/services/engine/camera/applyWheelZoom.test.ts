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
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import { MAX_DISTANCE_MPC } from '../../../../src/utils/camera/clampDistance';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

const BASE: CameraPose = { target: [0, 0, 0], yaw: 1, pitch: 0.2, distance: 100 };

describe('applyWheelZoom', () => {
  it('scales the follow distance target in place while following (zoom is not swallowed)', () => {
    // Follow is the active winner (prevActiveId 'followBody') with a seeded
    // distance target. A wheel-out factor > 1 must GROW the follow target, not
    // the (invisible) base — this is the whole bug: pre-fix the wheel committed
    // base and the follow driver ignored it.
    const clock = createCameraClock();
    clock.followDistanceTarget = 50;

    const result = applyWheelZoom(clock, 'followBody', BASE, 1.2);

    expect(result).toBeNull(); // nothing to commit into the store
    expect(clock.followDistanceTarget).toBeCloseTo(60, 9); // 50 * 1.2
  });

  it('clamps the scaled follow target to the shared zoom envelope', () => {
    const clock = createCameraClock();
    clock.followDistanceTarget = MAX_DISTANCE_MPC;
    applyWheelZoom(clock, 'followBody', BASE, 1000);
    expect(clock.followDistanceTarget).toBe(MAX_DISTANCE_MPC);
  });

  it('commits the zoomed base when the resting driver owns the distance', () => {
    const clock = createCameraClock();
    const result = applyWheelZoom(clock, 'resting', BASE, 2);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(200, 9); // 100 * 2
    // The follow target is untouched — resting reads base, not the follow clock.
    expect(clock.followDistanceTarget).toBeNull();
  });

  it('commits the zoomed base when autoRotate owns the distance while following', () => {
    // autoRotate wins the orbit terms while a body is focused (it outranks
    // followBody); it reads base.distance, so the wheel must edit base — not the
    // follow target — for the zoom to show.
    const clock = createCameraClock();
    clock.followDistanceTarget = 50;
    const result = applyWheelZoom(clock, 'autoRotate', BASE, 0.5);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(50, 9); // 100 * 0.5, via base
    expect(clock.followDistanceTarget).toBe(50); // follow target untouched
  });

  it('falls back to a base commit in the one-frame window before the follow target is seeded', () => {
    // prevActiveId says followBody but the driver has not run its pose yet to
    // seed the target (null). Committing base is harmless: the approach re-seeds
    // the framing distance on its first produce.
    const clock = createCameraClock();
    clock.followDistanceTarget = null;
    const result = applyWheelZoom(clock, 'followBody', BASE, 1.1);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(110, 9);
  });
});
