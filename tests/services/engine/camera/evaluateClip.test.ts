/**
 * evaluateClip — unit tests for the pure three-layer camera evaluator.
 *
 * Each test exercises one property of the `base + ∫vel + osc` composition.
 * Inputs are built via `effectHelpers` constructors (no raw `{ kind }` literals)
 * and the `ClipData` shape. All assertions are deterministic; no wall-clock.
 *
 * The final section ('focus tween = one-segment clip') verifies that a
 * one-segment clip with `ease:'easeOutCubic'` and `space:'lin'` on distance is
 * reproduces the focus-tween motion exactly — `evaluateClip` via `tweenToClip`
 * is the single camera-evaluation path for both scripted clips and focus tweens.
 */

import { describe, it, expect } from 'vitest';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import {
  dollyTo,
  rate,
  oscillate,
  tween,
  moveTarget,
  all,
  seq,
  wait,
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
// Test 5b — windowed oscillation: amplitude fades in/out, silent outside window
//
// `oscillate('pitch', { amp:0.1, period:4, over:10, fade:2, ease:'linear' })`:
//   the bob runs over [0,10); a linear fade ramps amplitude 0→1 over the first
//   2s, holds 1, ramps 1→0 over the last 2s. sin(2π t / 4) = 1 at t∈{1,5,9}.
//   - t=1 (fade-in,  env=0.5): pitch === base + 0.05
//   - t=5 (held,     env=1):   pitch === base + 0.10
//   - t=9 (fade-out, env=0.5): pitch === base + 0.05
//   - t=11 (past window):      pitch === base  (silent)
// ---------------------------------------------------------------------------

describe('evaluateClip windowed osc fades its amplitude', () => {
  it('linear fade over a [0,10) window: 0.5 / 1 / 0.5 amplitude, silent after', () => {
    const basePitch = 0.3;
    const amp = 0.1;
    const data: ClipData = {
      start: { target: [0, 0, 0], yaw: 0, pitch: basePitch, distance: 10 },
      timeline: [oscillate('pitch', { amp, period: 4, over: 10, fade: 2, ease: 'linear' })],
    };

    expect(evaluateClip(data, 1).pitch).toBeCloseTo(basePitch + 0.5 * amp, 8); // fading in
    expect(evaluateClip(data, 5).pitch).toBeCloseTo(basePitch + amp, 8); // full amplitude
    expect(evaluateClip(data, 9).pitch).toBeCloseTo(basePitch + 0.5 * amp, 8); // fading out
    expect(evaluateClip(data, 11).pitch).toBeCloseTo(basePitch, 10); // past the window → silent
  });

  it('reads the phase window-locally: a mid-timeline window starts its sine at 0', () => {
    // The bob is authored to start where its window starts — a dwell tail at
    // t=3 must swing exactly like the same dwell at t=0, or the sine's phase
    // (and its zero crossings, which the fade is aligned against) depends on
    // where the dwell happens to sit in the timeline.
    const basePitch = 0.3;
    const amp = 0.1;
    const data: ClipData = {
      start: { target: [0, 0, 0], yaw: 0, pitch: basePitch, distance: 10 },
      timeline: [
        wait(3),
        oscillate('pitch', { amp, period: 4, over: 10, fade: 2, ease: 'linear' }),
      ],
    };

    // Window [3, 13), local t' = t − 3, value = env(t') · sin(2π t'/4).
    expect(evaluateClip(data, 4).pitch).toBeCloseTo(basePitch + 0.5 * amp, 8); // t'=1: env 0.5 · sin(π/2)
    expect(evaluateClip(data, 8).pitch).toBeCloseTo(basePitch + amp, 8); // t'=5: env 1 · sin(π/2)
    expect(evaluateClip(data, 13).pitch).toBeCloseTo(basePitch, 10); // past the window → silent
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

// ---------------------------------------------------------------------------
// Test 9 — focus tween = one-segment clip
//
// A focus tween is the degenerate clip: one `set`/`setVec` segment per channel
// with `ease:'easeOutCubic'` and `space:'lin'` for `distance` (focus
// tweens use linear distance interpolation, not log-space). These four cases
// These four cases pin that `evaluateClip` via `tweenToClip` reproduces the
// focus-tween motion exactly — the single camera-evaluation path for scripted
// clips and tweens.
//
// Helper: build the ClipData that corresponds to a CameraTweenDescriptor with
// the given from/to/durationMs. Distance explicitly uses space:'lin' for the
// focus tween's linear lerp(from, to, t) path — the clip default is 'log'.
// ---------------------------------------------------------------------------

function makeTweenClip(opts: { from: CameraPose; to: CameraPose; durationMs: number }): ClipData {
  const durationSec = opts.durationMs / 1000;
  return {
    start: opts.from,
    timeline: [
      all([
        tween('distance', {
          to: opts.to.distance,
          over: durationSec,
          ease: 'easeOutCubic',
          space: 'lin',
        }),
        tween('yaw', { to: opts.to.yaw, over: durationSec, ease: 'easeOutCubic' }),
        tween('pitch', { to: opts.to.pitch, over: durationSec, ease: 'easeOutCubic' }),
        moveTarget(opts.to.target, durationSec, 'easeOutCubic'),
      ]),
    ],
  };
}

const TWEEN_FROM: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
const TWEEN_TO: CameraPose = { target: [10, 0, 0], yaw: 1.0, pitch: 0.2, distance: 50 };
const DURATION_MS = 600;
const DURATION_SEC = DURATION_MS / 1000;

describe('focus tween = one-segment clip', () => {
  it('evaluateClip matches the old tween at t=0', () => {
    // At elapsed=0, the pose must equal `from` on all channels.
    const data = makeTweenClip({ from: TWEEN_FROM, to: TWEEN_TO, durationMs: DURATION_MS });
    const pose = evaluateClip(data, 0);

    expect(pose.target[0]).toBeCloseTo(TWEEN_FROM.target[0], 10);
    expect(pose.target[1]).toBeCloseTo(TWEEN_FROM.target[1], 10);
    expect(pose.target[2]).toBeCloseTo(TWEEN_FROM.target[2], 10);
    expect(pose.yaw).toBeCloseTo(TWEEN_FROM.yaw, 10);
    expect(pose.pitch).toBeCloseTo(TWEEN_FROM.pitch, 10);
    expect(pose.distance).toBeCloseTo(TWEEN_FROM.distance, 10);
  });

  it('evaluateClip eases yaw via shortest arc', () => {
    // from.yaw = 3.0 rad, to.yaw = -3.0 rad. The short arc crosses ±π (total
    // delta ≈ 0.28 rad). At the mid-point (easeOutCubic(0.5) ≈ 0.875 of the
    // way to the destination) the result must still be near ±π, far from 0.
    // Ruling out abs(yaw) < π/2 eliminates the long-arc path.
    const from: CameraPose = { target: [0, 0, 0], yaw: 3.0, pitch: 0, distance: 100 };
    const to: CameraPose = { target: [0, 0, 0], yaw: -3.0, pitch: 0, distance: 100 };
    const data = makeTweenClip({ from, to, durationMs: DURATION_MS });

    // elapsed = half of DURATION_SEC
    const pose = evaluateClip(data, DURATION_SEC / 2);

    // Short arc: result must be near ±π, not near 0 (long arc).
    expect(Math.abs(pose.yaw)).toBeGreaterThan(Math.PI / 2);
  });

  it('evaluateClip saturates to an exact copy of to past the deadline', () => {
    // At elapsed >= durationSec, every scalar field must be === to (not
    // easeOutCubic(1) via floating-point), and target must be a fresh array.
    const data = makeTweenClip({ from: TWEEN_FROM, to: TWEEN_TO, durationMs: DURATION_MS });

    // Well past the segment window (> DURATION_SEC).
    const pose = evaluateClip(data, DURATION_SEC * 2);

    // Exact saturation — the evaluator holds `to` once the segment ends, it
    // does not re-evaluate easeOutCubic. A !== comparison would catch aliasing.
    expect(pose.yaw).toBe(TWEEN_TO.yaw);
    expect(pose.pitch).toBe(TWEEN_TO.pitch);
    expect(pose.distance).toBe(TWEEN_TO.distance);
    // target values must match to exactly…
    expect(pose.target[0]).toBe(TWEEN_TO.target[0]);
    expect(pose.target[1]).toBe(TWEEN_TO.target[1]);
    expect(pose.target[2]).toBe(TWEEN_TO.target[2]);
    // …but the array must be a fresh allocation (not aliased to to.target).
    expect(pose.target).not.toBe(TWEEN_TO.target);
  });

  it('evaluateClip keeps focus-tween distance LINEAR via space:lin', () => {
    // A one-segment clip with `space:'lin'` on distance must interpolate
    // linearly, not in log space. The two paths diverge when from !== to.
    //
    // At the mid-progress t = 0.5 (ease:'linear' for a clean ratio):
    //   linear midpoint: lerp(from, to, 0.5) = (from + to) / 2
    //   log midpoint:    exp(lerp(ln from, ln to, 0.5)) = sqrt(from * to)
    //
    // For from=100, to=0, the log midpoint is undefined (ln(0) = -Inf);
    // use from=10, to=1000 for a safe comparison.
    //   linear(0.5) = 505
    //   log(0.5)    = sqrt(10 * 1000) ≈ 100   (very different!)
    const from: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 };
    const to: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1000 };
    // Use ease:'linear' so the progress at half-duration is exactly 0.5 and
    // the expected value is exactly lerp(10, 1000, 0.5) = 505.
    const durationSec = 2;
    const data: ClipData = {
      start: from,
      timeline: [
        all([
          tween('distance', { to: to.distance, over: durationSec, ease: 'linear', space: 'lin' }),
          tween('yaw', { to: to.yaw, over: durationSec, ease: 'linear' }),
          tween('pitch', { to: to.pitch, over: durationSec, ease: 'linear' }),
          moveTarget(to.target, durationSec, 'linear'),
        ]),
      ],
    };

    const pose = evaluateClip(data, 1); // t = 0.5 of 2s duration

    // Linear midpoint: lerp(10, 1000, 0.5) = 505.
    expect(pose.distance).toBeCloseTo(505, 5);

    // Log midpoint for contrast: sqrt(10 * 1000) ≈ 100, which is far from 505.
    // Asserting the result is well above 200 rules out the log path decisively.
    expect(pose.distance).toBeGreaterThan(200);
  });
});
