/**
 * evaluateClip — `flyPath` integration: a path supersedes the base layer for the
 * four camera channels over its window, while the velocity/oscillation layers
 * still add on top.
 *
 * These tests drive `evaluateClip` end-to-end (compile → evaluate) with a clip
 * whose only camera motion is a `flyPath`, proving the evaluator reads the
 * compiled `pathTracks` rather than freezing on the start pose.
 */

import { describe, it, expect } from 'vitest';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import {
  flyPath,
  atPoint,
  oscillate,
  fork,
  all,
} from '../../../../src/services/engine/animation/effectHelpers';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

const START: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };

/** Reconstruct the eye position from a pose via the orbit convention. */
function eyeOf(p: { target: readonly number[]; distance: number; yaw: number; pitch: number }) {
  const cp = Math.cos(p.pitch);
  return [
    p.target[0]! + p.distance * (cp * Math.sin(p.yaw)),
    p.target[1]! + p.distance * Math.sin(p.pitch),
    p.target[2]! + p.distance * (cp * Math.cos(p.yaw)),
  ];
}

describe('evaluateClip with a flyPath', () => {
  const data: ClipData = {
    start: START,
    timeline: [
      flyPath([atPoint([10, 0, 0], 5), atPoint([20, 0, 0], 3)], { over: 4, ease: 'linear' }),
    ],
  };

  it('drives the camera (eye) along the path instead of holding the start pose', () => {
    const a = evaluateClip(data, 0);
    expect(eyeOf(a)[0]).toBeCloseTo(0, 4); // live eye at [0,0,1]
    expect(eyeOf(a)[2]).toBeCloseTo(1, 4);
    expect(a.distance).toBeCloseTo(1, 5);

    const b = evaluateClip(data, 4);
    // Settles framed on the final waypoint: eye stops 3 short of [20,0,0] (→ x=17)
    // and the look-at target lands on the centre at the framing distance.
    expect(eyeOf(b)[0]).toBeCloseTo(17, 3);
    expect(b.target[0]).toBeCloseTo(20, 3);
    expect(b.distance).toBeCloseTo(3, 3);

    // Midway: the eye is strictly between the endpoints (not frozen at start).
    const m = evaluateClip(data, 2);
    expect(eyeOf(m)[0]).toBeGreaterThan(0);
    expect(eyeOf(m)[0]).toBeLessThan(20);
    expect(m.distance).toBeGreaterThan(1);
    expect(m.distance).toBeLessThan(100);
  });

  it('lets a forked oscillation ride on top of the path (additive)', () => {
    const withBob: ClipData = {
      start: START,
      timeline: [
        all([
          flyPath([atPoint([10, 0, 0], 5), atPoint([20, 0, 0], 3)], { over: 4, ease: 'linear' }),
          fork(oscillate('pitch', { amp: 0.1, period: 4 })),
        ]),
      ],
    };
    // At t=1 the sine is at its peak (sin(2π·1/4) = sin(π/2) = 1), so pitch should
    // be the path's pitch (0 here) plus the full oscillation amplitude.
    const s = evaluateClip(withBob, 1);
    expect(s.pitch).toBeCloseTo(0.1, 4);
  });
});
