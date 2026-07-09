/**
 * sampleClipPath — the debug clip-path inspector's pure sampler.
 *
 * Given a resolved `ClipData`, its duration, and a sample count, it walks the
 * clip uniformly in TIME via `evaluateClip`, reconstructs the eye per sample,
 * and tags each with a perceived (scale-space) speed normalised to [0,1] across
 * the path. This is what the "Calculate" button precomputes so the route can be
 * coloured and scrubbed without playback.
 */

import { describe, it, expect } from 'vitest';
import { sampleClipPath } from '../../../../src/services/engine/animation/sampleClipPath';
import { flyPath, atPoint } from '../../../../src/services/engine/animation/effectHelpers';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

const START: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };

/**
 * A simple two-waypoint flyPath, hand-placed so no focus resolution is needed.
 * `rampSec: 0` opts out of the default trapezoidal envelope so the pacing is the
 * plain `ease: 'linear'` this test reasons about.
 */
const DATA: ClipData = {
  start: START,
  timeline: [
    flyPath([atPoint([10, 0, 0], 5), atPoint([20, 0, 0], 3)], {
      over: 4,
      ease: 'linear',
      rampSec: 0,
      linger: 0, // opt out of the default dwell — this asserts a flat 4s take
    }),
  ],
};

describe('sampleClipPath', () => {
  it('returns a snapshot of the requested length sampled uniformly in time', () => {
    const snap = sampleClipPath('flyPathDemo', DATA, 4, 20);
    expect(snap.clipId).toBe('flyPathDemo');
    expect(snap.durationSec).toBe(4);
    expect(snap.samples).toHaveLength(20);

    // Uniform time: first at 0, last at duration, strictly increasing.
    expect(snap.samples[0]!.t).toBeCloseTo(0, 6);
    expect(snap.samples[19]!.t).toBeCloseTo(4, 6);
    for (let i = 1; i < snap.samples.length; i++) {
      expect(snap.samples[i]!.t).toBeGreaterThan(snap.samples[i - 1]!.t);
    }
  });

  it('reconstructs the eye at the live start and the framed destination', () => {
    const snap = sampleClipPath('flyPathDemo', DATA, 4, 20);

    // First sample: the live eye at [0,0,1].
    const first = snap.samples[0]!;
    expect(first.eye[0]).toBeCloseTo(0, 3);
    expect(first.eye[2]).toBeCloseTo(1, 3);

    // Last sample: settled framed — eye 3 short of [20,0,0] (x=17), looking AT
    // the centre at distance 3.
    const last = snap.samples[19]!;
    expect(last.eye[0]).toBeCloseTo(17, 2);
    expect(last.target[0]).toBeCloseTo(20, 2);
    expect(last.distance).toBeCloseTo(3, 2);
  });

  it('normalises perceived speed to [0,1] spanning the full range', () => {
    const snap = sampleClipPath('flyPathDemo', DATA, 4, 40);
    let min = Infinity;
    let max = -Infinity;
    for (const s of snap.samples) {
      expect(s.speed01).toBeGreaterThanOrEqual(0);
      expect(s.speed01).toBeLessThanOrEqual(1);
      min = Math.min(min, s.speed01);
      max = Math.max(max, s.speed01);
    }
    // The ease accelerates then decelerates, so the path genuinely varies in
    // speed: normalisation should reach both ends of [0,1].
    expect(min).toBeCloseTo(0, 5);
    expect(max).toBeCloseTo(1, 5);
  });
});
