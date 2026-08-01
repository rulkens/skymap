/**
 * reencodePose tests — re-expressing (yaw, pitch) across an orientation-frame
 * change without moving the camera.
 *
 * The invariant under test is geometric, not formulaic: decode the INPUT
 * pose's angles under `from` and the OUTPUT pose's angles under `to`
 * independently, then compare the resulting world directions. A transposed
 * basis or a flipped sign in the implementation would still let a test that
 * merely re-derives the same formula pass; comparing two independently
 * decoded world vectors does not.
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

    // target and distance carry no frame dependence.
    expect(out.target).toBe(pose.target);
    expect(out.distance).toBe(pose.distance);
  });

  it('returns the input by reference when the bases are identical', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.1, pitch: 0.2, distance: 5 };

    expect(reencodePose(pose, undefined, undefined)).toBe(pose);

    const basis = ORIENTATION_FRAMES.galactic;
    expect(reencodePose(pose, basis, basis)).toBe(pose);
  });
});
