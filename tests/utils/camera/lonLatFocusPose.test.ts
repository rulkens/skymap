/**
 * lonLatFocusPose — verifies the composed pose actually lands the camera
 * where asked, by round-tripping through the SAME math the sub-camera debug
 * readout uses to report where the camera is: `camPosLocal` (Rᵀ · world
 * offset) then `directionToLonLatDeg`. If the pose's yaw/pitch encode didn't
 * exactly invert the readout's world→local decode, this catches it as a
 * lon/lat mismatch rather than a silent aim error only visible on screen.
 */
import { describe, it, expect } from 'vitest';

import { lonLatFocusPose } from '../../../src/utils/camera/lonLatFocusPose';
import { directionToLonLatDeg } from '../../../src/utils/scene/directionToLonLatDeg';
import { camPosLocal } from '../../../src/utils/camera/camPosLocal';
import { yawPitchToDir } from '../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { multiply3x3 } from '../../../src/utils/math/multiply3x3';
import { rotXMat3 } from '../../../src/utils/math/rotXMat3';
import { rotYMat3 } from '../../../src/utils/math/rotYMat3';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import type { LonLatDeg } from '../../../src/@types/scene/LonLatDeg';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Read back the sub-camera lon/lat the SAME way `earthTileSubsystem`'s
 *  `getDebugSnapshot` does: camera position in the body's local frame
 *  (`camPosLocal`, Rᵀ · world offset), normalised, then `directionToLonLatDeg`. */
function readSubCameraLonLat(
  target: Vec3,
  yaw: number,
  pitch: number,
  distance: number,
  frameBasis: Mat3,
  bodyOrientation: Mat3,
): LonLatDeg {
  const dirLocal = yawPitchToDir(yaw, pitch);
  const dirWorld = rotateVec3ByTightMat3(dirLocal, frameBasis);
  const camPosMpc: Vec3 = [
    target[0] + distance * dirWorld[0],
    target[1] + distance * dirWorld[1],
    target[2] + distance * dirWorld[2],
  ];
  // radiusMpc = 1: direction only, the readout normalises camDir separately
  // (cutSurfaceTiles) so the radius scale cancels out.
  const local = camPosLocal(camPosMpc, target, 1, bodyOrientation);
  const mag = Math.hypot(local[0], local[1], local[2]) || 1;
  const dir: Vec3 = [local[0] / mag, local[1] / mag, local[2] / mag];
  return directionToLonLatDeg(dir);
}

describe('lonLatFocusPose', () => {
  const target: Vec3 = [3.2, -1.4, 0.7];
  const distance = 0.05;
  const points: LonLatDeg[] = [
    { lonDeg: 12.53, latDeg: 55.67 }, // GeoDanmark demo patch centre
    { lonDeg: 0, latDeg: 0 },
    { lonDeg: 90, latDeg: 0 },
    { lonDeg: -90, latDeg: 0 },
    { lonDeg: 179, latDeg: 10 },
    { lonDeg: -179, latDeg: -10 },
    { lonDeg: 45, latDeg: 80 },
    { lonDeg: -60, latDeg: -70 },
  ];

  it('composes a pose whose sub-camera readout matches the input lon/lat', () => {
    const bodyOrientation = multiply3x3(rotYMat3(0.41), rotXMat3(0.18)); // axial-tilt stand-in
    const frameBasis = rotYMat3(-0.92); // a non-identity orientation-frame basis

    for (const point of points) {
      const pose = lonLatFocusPose(point, target, distance, bodyOrientation, frameBasis);
      const readback = readSubCameraLonLat(
        pose.target,
        pose.yaw,
        pose.pitch,
        distance,
        frameBasis,
        bodyOrientation,
      );
      expect(readback.lonDeg).toBeCloseTo(point.lonDeg, 9);
      expect(readback.latDeg).toBeCloseTo(point.latDeg, 9);
    }
  });

  it('preserves distance and re-centres the target on the body centre', () => {
    const bodyOrientation = rotYMat3(0.3);
    const frameBasis = rotXMat3(0.2);
    const pose = lonLatFocusPose(
      { lonDeg: 12.53, latDeg: 55.67 },
      target,
      distance,
      bodyOrientation,
      frameBasis,
    );
    expect(pose.distance).toBe(distance);
    expect(pose.target).toEqual(target);
    expect(pose.target).not.toBe(target); // fresh array, never aliases the input
  });

  it('is the identity map at (lon=0, lat=0) under identity bases: eye sits behind the target on world +Z', () => {
    const pose = lonLatFocusPose(
      { lonDeg: 0, latDeg: 0 },
      target,
      distance,
      IDENTITY_MAT3,
      IDENTITY_MAT3 as Mat3,
    );
    const dir = yawPitchToDir(pose.yaw, pose.pitch);
    // Sub-camera at local +X (lon=0, lat=0) means the eye sits along world +X
    // from the target (identity body orientation) — dir_world = eye - target,
    // normalised, must equal +X.
    expect(dir[0]).toBeCloseTo(1, 9);
    expect(dir[1]).toBeCloseTo(0, 9);
    expect(dir[2]).toBeCloseTo(0, 9);
  });
});
