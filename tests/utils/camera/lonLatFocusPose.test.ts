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
import type { LonLatDeg } from '../../../src/@types/scene/LonLatDeg';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** An exact (sin/cos-built, orthonormal to float64 precision) rotation about
 *  the world Y axis — a stand-in for a body's axial orientation / an
 *  orientation-frame basis that avoids the registry's ~1e-6 truncated
 *  literals, so this test can hold a tight tolerance. Column-major, matching
 *  the project's `Mat3` convention. */
function rotY(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}

/** Same, about the world X axis — composed with `rotY` to build a
 *  non-degenerate two-axis tilt (a single-axis rotation would leave that
 *  axis's own component untested). */
function rotX(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}

function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9).fill(0) as Mat3;
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += a[k * 3 + row]! * b[col * 3 + k]!;
      out[col * 3 + row] = sum;
    }
  }
  return out;
}

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
  // (planEarthTiles) so the radius scale cancels out.
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
    const bodyOrientation = mulMat3(rotY(0.41), rotX(0.18)); // axial-tilt stand-in
    const frameBasis = rotY(-0.92); // a non-identity orientation-frame basis

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
    const bodyOrientation = rotY(0.3);
    const frameBasis = rotX(0.2);
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
    const identity: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const pose = lonLatFocusPose({ lonDeg: 0, latDeg: 0 }, target, distance, identity, identity);
    const dir = yawPitchToDir(pose.yaw, pose.pitch);
    // Sub-camera at local +X (lon=0, lat=0) means the eye sits along world +X
    // from the target (identity body orientation) — dir_world = eye - target,
    // normalised, must equal +X.
    expect(dir[0]).toBeCloseTo(1, 9);
    expect(dir[1]).toBeCloseTo(0, 9);
    expect(dir[2]).toBeCloseTo(0, 9);
  });
});
