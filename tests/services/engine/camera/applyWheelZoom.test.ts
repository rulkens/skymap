/**
 * applyWheelZoom — the at-rest wheel notch as a pose to commit. The notch a
 * following camera swallows is the caller's business (the follow driver owns
 * that distance); what is left here is the base commit and the auto-rotate
 * spin it must fold in.
 */

import { describe, it, expect } from 'vitest';

import { applyWheelZoom } from '../../../../src/services/engine/camera/applyWheelZoom';
import { MIN_DISTANCE_MPC } from '../../../../src/utils/camera/clampDistance';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { PivotFraming } from '../../../../src/@types/camera/PivotFraming';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';

const BASE_POSE: CameraPose = { target: [0, 0, 0], yaw: 1, pitch: 0.2, distance: 100 };
const BASE = absoluteArm(BASE_POSE);
const FRAME_MS = 1000 / 60;
/** No focused pivot — the absolute floor, no taper anchor. */
const NO_PIVOT: PivotFraming = { radiusMpc: null, floorMpc: MIN_DISTANCE_MPC };
const IDLE_SPIN = { owns: false, rate: 0 };

describe('applyWheelZoom', () => {
  it('zooms the base when the resting driver owns the distance', () => {
    const result = applyWheelZoom({
      base: BASE,
      factor: 2,
      spin: IDLE_SPIN,
      autoRotateElapsedMs: 0,
      pivot: NO_PIVOT,
    });
    expect(result!.distance).toBeCloseTo(200, 9); // 100 * 2
  });

  it('folds the accumulated spin into the committed base under an active auto-rotate', () => {
    // autoRotate renders `spinAutoRotate(base, rate, elapsed)`. A wheel zoom must
    // commit the ALREADY-spun yaw, else installing a fresh base with the un-spun
    // yaw resets the spin epoch and the rendered yaw snaps back — the pop. The
    // caller hands in the spin epoch's elapsed at the wheel instant (500 ms).
    const rate = 0.01;
    const result = applyWheelZoom({
      base: BASE,
      factor: 0.5,
      spin: { owns: true, rate },
      autoRotateElapsedMs: 500,
      pivot: NO_PIVOT,
    });

    expect(result!.yaw).toBeCloseTo(BASE_POSE.yaw + rate * (500 / FRAME_MS), 9);
    expect(result!.distance).toBeCloseTo(50, 9); // 100 * 0.5
  });

  it('writes nothing', () => {
    // The single-writer bar: every follow-memory write left this function when
    // the notch became the driver's input, so a frozen bag must survive the
    // call. Frozen deep, because a nested write is the one that would slip
    // through — the module is strict-mode, so any write throws here.
    const pivot = Object.freeze({ radiusMpc: null, floorMpc: MIN_DISTANCE_MPC });
    const base = Object.freeze({
      frame: 'absolute',
      pose: Object.freeze({ ...BASE_POSE, target: Object.freeze([0, 0, 0]) }),
    });
    const args = Object.freeze({
      base: base as typeof BASE,
      factor: 1.5,
      spin: Object.freeze({ owns: true, rate: 0.01 }),
      autoRotateElapsedMs: 250,
      pivot,
    });

    expect(applyWheelZoom(args)!.distance).toBeCloseTo(150, 9);
  });
});
