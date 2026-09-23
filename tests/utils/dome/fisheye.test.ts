/**
 * Dome-maths tests: the WGSL fisheye port copies this TS twin byte-for-byte,
 * so a sign error here would otherwise show up only as a mirrored face at
 * the venue.
 */
import { describe, it, expect } from 'vitest';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { DOME_FACES } from '../../../src/data/rendering/domeFaces';
import { domeBasis } from '../../../src/utils/dome/domeBasis';
import { domeFaceRotations } from '../../../src/utils/dome/domeFaceRotations';
import { fisheyeDirection } from '../../../src/utils/dome/fisheyeDirection';
import { domeFaceUv } from '../../../src/utils/dome/domeFaceUv';
import { dot3 } from '../../../src/utils/math/dot3';
import { cross3 } from '../../../src/utils/math/cross3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { rotateVec3ByTightMat3T } from '../../../src/utils/math/rotateVec3ByTightMat3T';
import { mat3Columns } from '../../../src/utils/math/mat3Columns';

const DEG = Math.PI / 180;

function expectOrthonormalRightHanded(m: Readonly<Mat3>): void {
  const { right, up, forward } = mat3Columns(m);
  for (const axis of [right, up, forward]) {
    expect(Math.hypot(...axis)).toBeCloseTo(1, 12);
  }
  expect(dot3(right, up)).toBeCloseTo(0, 12);
  expect(dot3(up, forward)).toBeCloseTo(0, 12);
  expect(dot3(forward, right)).toBeCloseTo(0, 12);
  const computedRight = cross3(up, forward);
  expect(computedRight[0]).toBeCloseTo(right[0], 12);
  expect(computedRight[1]).toBeCloseTo(right[1], 12);
  expect(computedRight[2]).toBeCloseTo(right[2], 12);
}

/** A direction at `azimuthDeg` (0 = front/+z, +90 = right/+x) and `elevationDeg` above the horizon. */
function sphDir(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
}

describe('DOME_FACES and domeFaceRotations', () => {
  it('every DOME_FACES basis is orthonormal and right-handed', () => {
    for (const face of DOME_FACES) expectOrthonormalRightHanded(face);
  });

  it('every domeFaceRotations(60) basis is orthonormal and right-handed', () => {
    for (const rotation of domeFaceRotations(60)) expectOrthonormalRightHanded(rotation);
  });
});

describe('fisheyeDirection + domeFaceUv', () => {
  it('centre maps to the zenith on the top face', () => {
    const dir = fisheyeDirection(0, 0);
    expect(dir).not.toBeNull();
    expect(dir![0]).toBeCloseTo(0, 12);
    expect(dir![1]).toBeCloseTo(1, 12);
    expect(dir![2]).toBeCloseTo(0, 12);
    const uv = domeFaceUv(dir!);
    expect(uv.face).toBe(4);
    expect(uv.u).toBeCloseTo(0.5, 12);
    expect(uv.v).toBeCloseTo(0.5, 12);
  });

  it('the camera forward lands at 30 degree elevation on the front meridian', () => {
    const camForwardInDome = rotateVec3ByTightMat3T([0, 0, 1], domeBasis(60));
    const viaFisheye = fisheyeDirection(0, -2 / 3);
    expect(viaFisheye).not.toBeNull();
    expect(camForwardInDome[0]).toBeCloseTo(viaFisheye![0], 12);
    expect(camForwardInDome[1]).toBeCloseTo(viaFisheye![1], 12);
    expect(camForwardInDome[2]).toBeCloseTo(viaFisheye![2], 12);

    const uv = domeFaceUv(camForwardInDome);
    expect(uv.face).toBe(0);
    expect(uv.u).toBeCloseTo(0.5, 12);
    expect(uv.v).toBeCloseTo((1 - Math.tan(30 * DEG)) / 2, 12);
  });

  it('edges: bottom is the front horizon, top is back, right is right', () => {
    const bottom = fisheyeDirection(0, -1)!;
    const top = fisheyeDirection(0, 1)!;
    const right = fisheyeDirection(1, 0)!;
    expect(bottom[0]).toBeCloseTo(0, 12);
    expect(bottom[1]).toBeCloseTo(0, 12);
    expect(bottom[2]).toBeCloseTo(1, 12);
    expect(top[0]).toBeCloseTo(0, 12);
    expect(top[1]).toBeCloseTo(0, 12);
    expect(top[2]).toBeCloseTo(-1, 12);
    expect(right[0]).toBeCloseTo(1, 12);
    expect(right[1]).toBeCloseTo(0, 12);
    expect(right[2]).toBeCloseTo(0, 12);
  });

  it('outside the unit circle is none', () => {
    expect(fisheyeDirection(0.8, 0.8)).toBeNull();
    expect(fisheyeDirection(1, 0)).not.toBeNull();
  });

  it('every face is reached across a 64x64 NDC grid over the disc', () => {
    const N = 64;
    const hit = new Set<number>();
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const x = (2 * (ix + 0.5)) / N - 1;
        const y = 1 - (2 * (iy + 0.5)) / N;
        const dir = fisheyeDirection(x, y);
        if (dir === null) continue;
        hit.add(domeFaceUv(dir).face);
      }
    }
    expect(hit).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('is continuous across every side-side and side-top face edge', () => {
    const EPS = 1e-6;

    function checkDirection(dir: Readonly<Vec3>): void {
      const { face, u, v } = domeFaceUv(dir);
      const s = 2 * u - 1;
      const t = 1 - 2 * v;
      expect(Math.abs(s)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(t)).toBeLessThanOrEqual(1 + 1e-9);
      const { right, up, forward } = mat3Columns(DOME_FACES[face]!);
      const reconstructed = normalize3([
        right[0] * s + up[0] * t + forward[0],
        right[1] * s + up[1] * t + forward[1],
        right[2] * s + up[2] * t + forward[2],
      ]);
      expect(reconstructed[0]).toBeCloseTo(dir[0], 9);
      expect(reconstructed[1]).toBeCloseTo(dir[1], 9);
      expect(reconstructed[2]).toBeCloseTo(dir[2], 9);
    }

    // Four side-side edges at 45 degree azimuth, stepping across in azimuth.
    // Elevation stays within the dome's y>=0 coverage (no bottom face) and
    // below the triple point with the top face (atan(cos 45deg) ~= 35.26deg),
    // so each sample is a genuine 2-face edge.
    for (const azimuth of [45, 135, 225, 315]) {
      for (let elevation = 0; elevation <= 30; elevation += 5) {
        checkDirection(sphDir(azimuth - EPS / DEG, elevation));
        checkDirection(sphDir(azimuth + EPS / DEG, elevation));
      }
    }

    // Four side-top edges, one per side face's own meridian, stepping across
    // in elevation. deltaAzimuth stays within +-40deg of the face centre
    // (< the 45deg triple point with the neighbouring side face), and the
    // boundary elevation is where side-forward and top-forward dot products
    // tie: tan(e) = cos(deltaAzimuth).
    for (const centre of [0, 90, 180, 270]) {
      for (let deltaAzimuth = -40; deltaAzimuth <= 40; deltaAzimuth += 5) {
        const boundaryElevation = Math.atan(Math.cos(deltaAzimuth * DEG)) / DEG;
        checkDirection(sphDir(centre + deltaAzimuth, boundaryElevation - EPS / DEG));
        checkDirection(sphDir(centre + deltaAzimuth, boundaryElevation + EPS / DEG));
      }
    }
  });
});
