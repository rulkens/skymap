import { describe, expect, it } from 'vitest';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const defaultProjection: CameraProjection = {
  fovYRad: Math.PI / 4,
  aspect: 16 / 9,
  near: 0.01,
  far: 30000,
};

// The identity basis makes the frame-local decode already world space, so these
// cases reproduce the pre-feature (basis-free) geometry exactly.
const IDENTITY_BASIS: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const originPose: CameraPose = {
  target: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  distance: 5,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('assembleOrbitCamera', () => {
  it('merges pose + projection and derives position (known geometry)', () => {
    const result = assembleOrbitCamera(
      originPose,
      defaultProjection,
      IDENTITY_BASIS,
      IDENTITY_BASIS,
    );

    // Projection fields are forwarded unchanged.
    expect(result.fovYRad).toBe(defaultProjection.fovYRad);
    expect(result.aspect).toBe(defaultProjection.aspect);
    expect(result.near).toBe(defaultProjection.near);
    expect(result.far).toBe(defaultProjection.far);

    // Pose orbit params are forwarded unchanged.
    expect(result.yaw).toBe(originPose.yaw);
    expect(result.pitch).toBe(originPose.pitch);
    expect(result.distance).toBe(originPose.distance);

    // Target value equals the pose target.
    expect(result.target).toEqual([0, 0, 0]);

    // Known geometry: yaw=0, pitch=0, distance=5 → position = [0, 0, 5].
    // Use toBeCloseTo per component because gl-matrix uses Float32Array (small epsilon).
    expect(result.position[0]).toBeCloseTo(0, 5);
    expect(result.position[1]).toBeCloseTo(0, 5);
    expect(result.position[2]).toBeCloseTo(5, 5);
  });

  it('carries the frame basis and decodes position through it (equatorial pole)', () => {
    // Equatorial basis: middle column (the pole) is +z. yaw=0, pitch=π/2 decodes
    // to frame-local +Y (the zenith), which the basis rotates to world +z. So the
    // eye lands at target + distance·(+z) = [0, 0, 5] — the Task-5 hand-computed
    // pole case. This is the load-bearing check: position must decode through the
    // basis written onto the camera.
    const polePose: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: Math.PI / 2, distance: 5 };
    const equatorial = ORIENTATION_FRAMES.equatorial;
    const result = assembleOrbitCamera(polePose, defaultProjection, equatorial, equatorial);

    // The returned camera carries the basis it was assembled with.
    expect(result.poseBasis).toBe(equatorial);
    expect(result.upBasis).toBe(equatorial);

    // Position reflects the basis: local zenith rotates to the equatorial pole +z.
    expect(result.position[0]).toBeCloseTo(0, 5);
    expect(result.position[1]).toBeCloseTo(0, 5);
    expect(result.position[2]).toBeCloseTo(5, 5);
  });

  it('target is a fresh array — does not alias the input pose target', () => {
    const pose: CameraPose = { target: [1, 2, 3], yaw: 0, pitch: 0, distance: 10 };
    const result = assembleOrbitCamera(pose, defaultProjection, IDENTITY_BASIS, IDENTITY_BASIS);

    // Different reference.
    expect(result.target).not.toBe(pose.target);

    // Original pose target is unchanged.
    expect(pose.target).toEqual([1, 2, 3]);
  });

  it('is pure — pose and projection are not mutated after the call', () => {
    const pose: CameraPose = { target: [4, 5, 6], yaw: 0.3, pitch: 0.1, distance: 20 };
    const projection: CameraProjection = { fovYRad: 1.0, aspect: 1.5, near: 0.1, far: 1000 };

    // Capture snapshots before the call.
    const poseSnap = { ...pose, target: [...pose.target] };
    const projSnap = { ...projection };

    assembleOrbitCamera(pose, projection, IDENTITY_BASIS, IDENTITY_BASIS);

    // Pose is unchanged.
    expect(pose.target).toEqual(poseSnap.target);
    expect(pose.yaw).toBe(poseSnap.yaw);
    expect(pose.pitch).toBe(poseSnap.pitch);
    expect(pose.distance).toBe(poseSnap.distance);

    // Projection is unchanged.
    expect(projection.fovYRad).toBe(projSnap.fovYRad);
    expect(projection.aspect).toBe(projSnap.aspect);
    expect(projection.near).toBe(projSnap.near);
    expect(projection.far).toBe(projSnap.far);
  });

  it('calling twice with the same inputs yields equivalent cameras', () => {
    const result1 = assembleOrbitCamera(
      originPose,
      defaultProjection,
      IDENTITY_BASIS,
      IDENTITY_BASIS,
    );
    const result2 = assembleOrbitCamera(
      originPose,
      defaultProjection,
      IDENTITY_BASIS,
      IDENTITY_BASIS,
    );

    expect(result1.target).toEqual(result2.target);
    expect(result1.yaw).toBe(result2.yaw);
    expect(result1.pitch).toBe(result2.pitch);
    expect(result1.distance).toBe(result2.distance);
    expect(result1.fovYRad).toBe(result2.fovYRad);
    expect(result1.aspect).toBe(result2.aspect);
    expect(result1.near).toBe(result2.near);
    expect(result1.far).toBe(result2.far);
    expect(Array.from(result1.position)).toEqual(Array.from(result2.position));
  });
});
