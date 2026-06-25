/**
 * flowOrbit tests — validate the seamless-orbit `Clip` compiles and evaluates
 * to a constant-rate yaw sweep with a returning pitch bob.
 *
 * The orbit is the inverse of the flyout: distance/target fixed, orientation
 * sweeps. We resolve `start: 'live'` against a test pose, then assert the
 * compiled duration (one revolution) and that yaw advances a full 2π while pitch
 * returns to its start (the seamless-loop property).
 */

import { describe, it, expect } from 'vitest';
import { flowOrbit } from '../../../../src/data/animation/clips/flowOrbit';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import { resolveClipStart } from '../../../../src/state/camera/cameraSlice';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

const PERIOD_SEC = 30;

const TEST_POSE: CameraPose = {
  target: [1, 2, 3],
  yaw: 0.5,
  pitch: 0.1,
  distance: 1200, // Mpc — framed out on the flow basin
};

describe('flowOrbit clip', () => {
  it('starts live (orbits from the user-dialed framing)', () => {
    expect(flowOrbit.data.start).toBe('live');
  });

  it('compiles without a single-writer clash', () => {
    // yaw (spin) and pitch (oscillate) are distinct channels — no overlap.
    expect(() => compileClip(flowOrbit.data)).not.toThrow();
  });

  it('lasts exactly one revolution period (the forked bob does not extend it)', () => {
    expect(compileClip(flowOrbit.data).durationSec).toBe(PERIOD_SEC);
  });

  it('advances yaw a full 2π and returns pitch to start (seamless loop)', () => {
    const resolved = resolveClipStart(flowOrbit.data, TEST_POSE);

    const end = evaluateClip(resolved, PERIOD_SEC);
    // Constant-rate spin BY 2π over the period.
    expect(end.yaw - TEST_POSE.yaw).toBeCloseTo(Math.PI * 2, 5);
    // One full sine period of pitch bob returns exactly to the start pitch.
    expect(end.pitch).toBeCloseTo(TEST_POSE.pitch, 5);
    // Distance and target are untouched — only orientation sweeps.
    expect(end.distance).toBe(TEST_POSE.distance);
  });
});
