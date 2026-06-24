/**
 * evaluateClip — unit tests for the pure three-layer camera evaluator.
 *
 * Each test exercises one property of the `base + ∫vel + osc` composition.
 * Inputs are built via `effectHelpers` constructors (no raw `{ kind }` literals)
 * and the `ClipData` shape. All assertions are deterministic; no wall-clock.
 */

import { describe, it, expect } from 'vitest';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import {
  dollyTo,
  rate,
  oscillate,
  tween,
  all,
  seq,
} from '../../../../src/services/engine/animation/effectHelpers';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

// ---------------------------------------------------------------------------
// Shared starting pose for most tests.
// ---------------------------------------------------------------------------

const START: CameraPose = { target: [0, 0, 0], yaw: 0.5, pitch: 0.2, distance: 10 };

// ---------------------------------------------------------------------------
// Test 1 — t=0 returns the start pose exactly
// ---------------------------------------------------------------------------

describe('evaluateClip at t=0 returns the start pose', () => {
  it('single dollyTo clip: pose at t=0 equals the start pose', () => {
    const data: ClipData = {
      start: START,
      timeline: [dollyTo(100, 2)],
    };

    const pose = evaluateClip(data, 0);

    // All channels should be their start values at t=0.
    expect(pose.distance).toBeCloseTo(START.distance, 10);
    expect(pose.yaw).toBeCloseTo(START.yaw, 10);
    expect(pose.pitch).toBeCloseTo(START.pitch, 10);
    expect(pose.target[0]).toBeCloseTo(START.target[0], 10);
    expect(pose.target[1]).toBeCloseTo(START.target[1], 10);
    expect(pose.target[2]).toBeCloseTo(START.target[2], 10);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — dolly is log-uniform (half-decade at half-time)
//
// `dollyTo` uses `space:'log'`. A 1→100 tween with `ease:'linear'` should
// reach the geometric midpoint (√(1·100) = 10) at exactly t=0.5.
// The geometric midpoint is the defining property of log-space interpolation.
// ---------------------------------------------------------------------------

describe('evaluateClip dolly is log-uniform', () => {
  it('distance 1→100 with ease:linear reaches 10 at t=0.5', () => {
    const data: ClipData = {
      start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
      timeline: [dollyTo(100, 1, 'linear')],
    };

    const pose = evaluateClip(data, 0.5);

    // At t=0.5 with ease:'linear', log-space lerp gives exp(lerp(0, ln100, 0.5))
    // = exp(ln100 / 2) = sqrt(100) = 10.
    expect(pose.distance).toBeCloseTo(10, 5);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — base holds the final value past the segment end
// ---------------------------------------------------------------------------

describe('evaluateClip holds the final base value past the segment end', () => {
  it('distance holds at `to` after the dollyTo window closes', () => {
    const to = 300;
    const data: ClipData = {
      start: START,
      timeline: [dollyTo(to, 2)], // durationSec = 2
    };

    // Query well past the end.
    const pose = evaluateClip(data, 5);
    expect(pose.distance).toBeCloseTo(to, 10);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — rate keeps integrating after the ramp ends
//
// A `rate('yaw', { to:0.1, over:1 })` ramps yaw velocity from 0 to 0.1 rad/s
// over 1 second, then holds 0.1 rad/s. Yaw displacement must grow monotonically:
// yaw(2) > yaw(1) > yaw(0) = 0.
// ---------------------------------------------------------------------------

describe('evaluateClip rate keeps integrating after the ramp ends', () => {
  it('yaw displacement is monotone increasing and yaw(2) > yaw(1)', () => {
    const data: ClipData = {
      start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
      timeline: [rate('yaw', { to: 0.1, over: 1 })],
    };

    const yaw1 = evaluateClip(data, 1).yaw;
    const yaw2 = evaluateClip(data, 2).yaw;

    // After the ramp ends, the velocity is held at 0.1 rad/s, so yaw continues
    // to grow. yaw(2) > yaw(1) and both are positive.
    expect(yaw1).toBeGreaterThan(0);
    expect(yaw2).toBeGreaterThan(yaw1);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — osc is additive and zero-mean
//
// `oscillate('pitch', { amp:0.1, period:4 })`: sin(2π t / 4).
//   - t=0: sin(0) = 0   → pitch === basePitch
//   - t=1: sin(π/2) = 1 → pitch === basePitch + 0.1
//   - t=2: sin(π) = 0   → pitch === basePitch
// ---------------------------------------------------------------------------

describe('evaluateClip osc is additive and zero-mean', () => {
  it('pitch osc with period=4, amp=0.1: correct values at t=0, 1, 2', () => {
    const basePitch = 0.3;
    const amp = 0.1;
    const data: ClipData = {
      start: { target: [0, 0, 0], yaw: 0, pitch: basePitch, distance: 10 },
      timeline: [oscillate('pitch', { amp, period: 4 })],
    };

    expect(evaluateClip(data, 0).pitch).toBeCloseTo(basePitch, 10);
    expect(evaluateClip(data, 1).pitch).toBeCloseTo(basePitch + amp, 8);
    expect(evaluateClip(data, 2).pitch).toBeCloseTo(basePitch, 8);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — purity: same (data, t) twice → deep-equal; fresh target array
// ---------------------------------------------------------------------------

describe('evaluateClip is pure', () => {
  it('same (data, t) twice produces deep-equal results', () => {
    const data: ClipData = {
      start: START,
      timeline: [dollyTo(200, 3)],
    };

    const a = evaluateClip(data, 1.5);
    const b = evaluateClip(data, 1.5);

    expect(a).toEqual(b);
  });

  it('target array is a fresh allocation each call (never aliased)', () => {
    const data: ClipData = {
      start: START,
      timeline: [dollyTo(200, 3)],
    };

    const a = evaluateClip(data, 1.5);
    const b = evaluateClip(data, 1.5);

    // Distinct array references — mutating one does not affect the other.
    expect(a.target).not.toBe(b.target);
  });
});

// ---------------------------------------------------------------------------
// Test 7 — velocity ramps OVERRIDE, not stack
//
// Two sequential `rate` ramps on `yaw`:
//   ramp A: yaw velocity 0 → 1.0 rad/s over 1 second  (active [0, 1))
//   ramp B: yaw velocity 1.0 → 0.2 rad/s over 1 second (active [1, 2))
//
// After both ramps complete (t > 2), the channel velocity is held at 0.2 rad/s.
// The stacking (wrong) model would accumulate both ramps' integrals starting
// from rest, yielding velocity ≈ 1.0 + 0.2 = 1.2 rad/s after t=2.
// The override (correct) model carries ramp A's final velocity (1.0) into ramp B,
// which ramps it DOWN to 0.2, so the held velocity after t=2 is exactly 0.2.
//
// Measured as: yaw(t+1) − yaw(t) ≈ 0.2 for some t well past both ramps.
// Under stacking that delta would be ≈ 1.2 (6× larger).
// ---------------------------------------------------------------------------

describe('evaluateClip velocity ramps OVERRIDE, not stack', () => {
  it('second rate ramp governs velocity; delta is ~0.2/s, not ~1.2/s', () => {
    // ramp A: 0→1.0 rad/s over 1 second; ramp B: →0.2 rad/s over 1 second.
    // seq ensures B starts immediately after A ends (at t=1).
    const data: ClipData = {
      start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
      timeline: [
        seq([
          rate('yaw', { to: 1.0, over: 1, ease: 'linear' }),
          rate('yaw', { to: 0.2, over: 1, ease: 'linear' }),
        ]),
      ],
    };

    // Query in the held region well after both ramps, measuring the 1-second delta.
    // Both ramps end by t=2; at t=3 and t=4 the velocity is held at 0.2 rad/s.
    const yaw3 = evaluateClip(data, 3).yaw;
    const yaw4 = evaluateClip(data, 4).yaw;
    const delta = yaw4 - yaw3;

    // Override: the second ramp's held velocity (0.2 rad/s) governs → delta ≈ 0.2.
    expect(delta).toBeCloseTo(0.2, 4);

    // Stacking would give ≈ 1.2 rad/s. Assert the correct value is well below
    // even 0.5 to make the distinction unambiguous.
    expect(delta).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// Test 8 — composes base + vel + osc correctly on yaw
//
// Build three single-layer clips that each touch only one layer of yaw at a
// fixed time t=1.5. Assert that the combined clip's yaw delta equals the sum
// of the three independent deltas (linearity of the additive model).
// Note: the vel-only clip uses a SINGLE rate ramp; this is intentionally
// single-ramp to keep it independent of Test 7's multi-ramp override behavior.
// ---------------------------------------------------------------------------

describe('evaluateClip composes base+vel+osc on one channel', () => {
  it('combined yaw delta equals sum of base-only, vel-only, and osc-only deltas', () => {
    const startYaw = 0;
    const t = 1.5;

    // Base-only: tween yaw from 0 to 1 over 3 s with linear ease.
    const baseOnlyData: ClipData = {
      start: { target: [0, 0, 0], yaw: startYaw, pitch: 0, distance: 10 },
      timeline: [tween('yaw', { to: 1, over: 3, ease: 'linear' })],
    };

    // Vel-only: rate yaw to 0.2 over 1 s (no base movement).
    const velOnlyData: ClipData = {
      start: { target: [0, 0, 0], yaw: startYaw, pitch: 0, distance: 10 },
      timeline: [rate('yaw', { to: 0.2, over: 1, ease: 'linear' })],
    };

    // Osc-only: oscillate yaw with amp=0.05, period=2.
    const oscOnlyData: ClipData = {
      start: { target: [0, 0, 0], yaw: startYaw, pitch: 0, distance: 10 },
      timeline: [oscillate('yaw', { amp: 0.05, period: 2 })],
    };

    // Combined: all three layers active simultaneously.
    // `all` shares the start time for all children, so tween/rate/osc are
    // co-active from t=0 — matching the independent single-layer clips above.
    const combinedData: ClipData = {
      start: { target: [0, 0, 0], yaw: startYaw, pitch: 0, distance: 10 },
      timeline: [
        all([
          tween('yaw', { to: 1, over: 3, ease: 'linear' }),
          rate('yaw', { to: 0.2, over: 1, ease: 'linear' }),
          oscillate('yaw', { amp: 0.05, period: 2 }),
        ]),
      ],
    };

    const baseDelta = evaluateClip(baseOnlyData, t).yaw - startYaw;
    const velDelta = evaluateClip(velOnlyData, t).yaw - startYaw;
    const oscDelta = evaluateClip(oscOnlyData, t).yaw - startYaw;
    const combinedYaw = evaluateClip(combinedData, t).yaw;

    // Combined yaw = startYaw + baseDelta + velDelta + oscDelta.
    expect(combinedYaw).toBeCloseTo(startYaw + baseDelta + velDelta + oscDelta, 6);
  });
});
