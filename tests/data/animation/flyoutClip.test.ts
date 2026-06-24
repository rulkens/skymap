/**
 * flyoutClip tests — validate the `flyout` ClipData literal compiles and
 * evaluates correctly.
 *
 * These tests are the acceptance proof for the animation data model (Plan A,
 * Task 13). They do NOT test compileClip or evaluateClip exhaustively (those
 * have their own suites); they test that the FLYOUT LITERAL, authored with the
 * high-level vocabulary, produces the expected behaviour end-to-end.
 *
 * ### Test pose choice
 *
 * `start: 'live'` cannot be evaluated directly — the evaluator needs a concrete
 * numeric `start.distance`. `resolveClipStart` binds the live token to a test
 * pose before each evaluation. We use `startDistance = 10` Mpc: a plausible
 * "zoomed into a nearby galaxy cluster" position that makes the geometric
 * midpoint assertion unambiguous (arithmetic mean ≈ 14 755; geometric mean ≈ 543).
 *
 * ### Log-interpolation midpoint
 *
 * `dollyTo` uses `space: 'log'` (from CHANNEL_SPACE). The evaluator interpolates
 * as `exp(lerp(ln(from), ln(to), t))`. At t=11 (exactly half of 22 s) the
 * `inOut` ease evaluates to 0.5 (the cubic in-out function is symmetric about
 * 0.5), so:
 *
 *   distance(11) = exp((ln(10) + ln(29500)) / 2) = sqrt(10 × 29500) ≈ 543.1
 *
 * This is the geometric mean, not the arithmetic mean (14755). The test asserts
 * both the value AND that it is far below the arithmetic midpoint, confirming
 * log interpolation is active and not accidentally falling back to linear.
 */

import { describe, it, expect } from 'vitest';
import { flyout } from '../../../src/data/animation/flyoutClip';
import { compileClip } from '../../../src/services/engine/animation/compileClip';
import { evaluateClip } from '../../../src/services/engine/camera/evaluateClip';
import { resolveClipStart } from '../../../src/state/camera/cameraSlice';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';

// ---------------------------------------------------------------------------
// Shared test pose — a concrete CameraPose used to resolve `start: 'live'`.
// ---------------------------------------------------------------------------

const START_DISTANCE = 10; // Mpc — nearby galaxy cluster viewing distance
const TEST_POSE: CameraPose = {
  target: [0, 0, 0],
  yaw: 0.3,
  pitch: -0.2,
  distance: START_DISTANCE,
};

describe('flyout clip', () => {
  it('compiles without a single-writer clash', () => {
    // dollyTo drives `distance` and spin drives `yaw` — distinct channels.
    // validateSingleWriter (called inside compileClip) throws on any overlap.
    // If this test passes, the clip is structurally valid.
    expect(() => compileClip(flyout)).not.toThrow();
  });

  it('has a total duration of 22 seconds', () => {
    const compiled = compileClip(flyout);
    expect(compiled.durationSec).toBe(22);
  });

  it('dollies to ~29 500 Mpc using log (geometric) interpolation', () => {
    const resolved = resolveClipStart(flyout, TEST_POSE);

    // At t=22 (end of clip): distance should be at the target, 29 500 Mpc.
    const poseEnd = evaluateClip(resolved, 22);
    expect(poseEnd.distance).toBeCloseTo(29_500, 0); // within 0.5 Mpc

    // At t=11 (exactly half of 22 s): the inOut ease evaluates to 0.5 (symmetric).
    // Log interpolation gives the GEOMETRIC midpoint: sqrt(from × to).
    // Linear interpolation would give the ARITHMETIC midpoint: (from + to) / 2.
    const poseMid = evaluateClip(resolved, 11);
    const geometricMidpoint = Math.sqrt(START_DISTANCE * 29_500); // ≈ 543.1
    const arithmeticMidpoint = (START_DISTANCE + 29_500) / 2;     // ≈ 14 755

    // Assert geometric: distance is close to sqrt(10 × 29500).
    expect(poseMid.distance).toBeCloseTo(geometricMidpoint, 0);

    // Assert NOT arithmetic: distance is far below the arithmetic midpoint,
    // confirming log-space interpolation (not a linear fallback).
    expect(poseMid.distance).toBeLessThan(arithmeticMidpoint * 0.1);
  });

  it('advances yaw by 1.1 rad over the full take', () => {
    const resolved = resolveClipStart(flyout, TEST_POSE);

    const poseEnd = evaluateClip(resolved, 22);
    // spin is additive: final_yaw - start_yaw ≈ 1.1
    expect(poseEnd.yaw - TEST_POSE.yaw).toBeCloseTo(1.1, 5);
  });
});
