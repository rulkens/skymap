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
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

const START: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };

/**
 * Reconstruct the eye the renderer does under a non-identity orientation
 * frame: `target + distance · (frameBasis · yawPitchToDir(yaw, pitch))` —
 * mirrors `updatePosition`'s tight column-major product, computed
 * independently of `sampleClipPath` so the test only passes when the
 * production reconstruction rotates the same way.
 */
function eyeUnderFrame(pose: CameraPose, frameBasis: Mat3): Vec3 {
  const cp = Math.cos(pose.pitch);
  const x = cp * Math.sin(pose.yaw);
  const y = Math.sin(pose.pitch);
  const z = cp * Math.cos(pose.yaw);
  const wx = frameBasis[0] * x + frameBasis[3] * y + frameBasis[6] * z;
  const wy = frameBasis[1] * x + frameBasis[4] * y + frameBasis[7] * z;
  const wz = frameBasis[2] * x + frameBasis[5] * y + frameBasis[8] * z;
  return [
    pose.target[0] + pose.distance * wx,
    pose.target[1] + pose.distance * wy,
    pose.target[2] + pose.distance * wz,
  ];
}

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

  it('inspector eye matches the rendered eye under a non-identity frame', () => {
    const frameBasis = ORIENTATION_FRAMES.ecliptic;
    const snap = sampleClipPath('flyPathDemo', DATA, 4, 20, frameBasis);

    // t=0 is the align-in blend at weight 0, so the sampled pose is exactly
    // the live START pose — the eye must land where the renderer's eye
    // actually starts, not the identity-frame decode of that same pose.
    const first = snap.samples[0]!;
    const expected = eyeUnderFrame(START, frameBasis);
    expect(first.eye[0]).toBeCloseTo(expected[0], 5);
    expect(first.eye[1]).toBeCloseTo(expected[1], 5);
    expect(first.eye[2]).toBeCloseTo(expected[2], 5);
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
