/**
 * reencodePose tests — re-expressing (yaw, pitch) across an orientation-frame
 * change without moving the camera.
 *
 * The invariant is geometric, not formulaic: decode input under `from` and
 * output under `to` independently, then compare the world directions — a
 * test that re-derives the same formula could pass despite a flipped sign
 * or transposed basis.
 */

import { describe, it, expect } from 'vitest';
import { reencodePose } from '../../../src/utils/camera/reencodePose';
import { yawPitchToDir } from '../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** World-space target→eye direction for (yaw, pitch) decoded under `basis`. */
function decodeWorld(yaw: number, pitch: number, basis: Mat3 | undefined): Vec3 {
  return rotateVec3ByTightMat3(yawPitchToDir(yaw, pitch), basis);
}

describe('reencodePose', () => {
  it('preserves the world eye direction across a basis change', () => {
    const from = ORIENTATION_FRAMES.ecliptic;
    const to = ORIENTATION_FRAMES.galactic;
    const pose: CameraPose = { target: [1, 2, 3], yaw: 0.7, pitch: 0.3, distance: 42 };

    const out = reencodePose(pose, from, to);

    const dirIn = decodeWorld(pose.yaw, pose.pitch, from);
    const dirOut = decodeWorld(out.yaw, out.pitch, to);
    expect(dirOut[0]).toBeCloseTo(dirIn[0], 5);
    expect(dirOut[1]).toBeCloseTo(dirIn[1], 5);
    expect(dirOut[2]).toBeCloseTo(dirIn[2], 5);

    // Same value as the input target — but a fresh array, never aliasing the
    // caller's (the non-identity branch constructs a new pose that must own it).
    expect(out.target).toEqual(pose.target);
    expect(out.target).not.toBe(pose.target);
    expect(out.distance).toBe(pose.distance);
  });

  it('returns the input by reference when the bases are identical', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.1, pitch: 0.2, distance: 5 };

    expect(reencodePose(pose, undefined, undefined)).toBe(pose);

    const basis = ORIENTATION_FRAMES.galactic;
    expect(reencodePose(pose, basis, basis)).toBe(pose);
  });

  // `undefined` on one side only (entering or leaving the identity frame) is a
  // real, non-identity case that both collaborators happen to handle correctly
  // today by independently treating `undefined` as identity — pin it so a
  // future change to either one's `undefined` handling fails loudly here.
  it('preserves the world eye direction when only one basis is the identity frame', () => {
    const to = ORIENTATION_FRAMES.supergalactic;
    const poseA: CameraPose = { target: [4, -1, 2], yaw: -0.9, pitch: 0.4, distance: 7 };
    const outA = reencodePose(poseA, undefined, to);
    const dirInA = decodeWorld(poseA.yaw, poseA.pitch, undefined);
    const dirOutA = decodeWorld(outA.yaw, outA.pitch, to);
    expect(dirOutA[0]).toBeCloseTo(dirInA[0], 5);
    expect(dirOutA[1]).toBeCloseTo(dirInA[1], 5);
    expect(dirOutA[2]).toBeCloseTo(dirInA[2], 5);

    const from = ORIENTATION_FRAMES.equatorial;
    const poseB: CameraPose = { target: [-3, 5, 0.5], yaw: 1.6, pitch: -0.3, distance: 11 };
    const outB = reencodePose(poseB, from, undefined);
    const dirInB = decodeWorld(poseB.yaw, poseB.pitch, from);
    const dirOutB = decodeWorld(outB.yaw, outB.pitch, undefined);
    expect(dirOutB[0]).toBeCloseTo(dirInB[0], 5);
    expect(dirOutB[1]).toBeCloseTo(dirInB[1], 5);
    expect(dirOutB[2]).toBeCloseTo(dirInB[2], 5);
  });
});
