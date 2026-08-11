/**
 * orbitEye — the spherical-orbit eye position, extracted from
 * galaxy-engine.js:277-282. Verifies the eye sits on a sphere of radius
 * `dist` around `target`, oriented by azimuth/elevation, and that moving
 * the target translates the eye rigidly.
 */
import { describe, expect, it } from 'vitest';
import { orbitEye } from '../../../../../tools/galaxy-renderer/src/engine/camera/orbitEye';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const ORIGIN: Vec3 = [0, 0, 0];

describe('orbitEye', () => {
  it('el=0, az=0 puts the eye at target + [dist, 0, 0]', () => {
    const eye = orbitEye(0, 0, 5, ORIGIN);
    expect(eye[0]).toBeCloseTo(5, 12);
    expect(eye[1]).toBeCloseTo(0, 12);
    expect(eye[2]).toBeCloseTo(0, 12);
  });

  it('el=pi/2 puts the eye dist above the target', () => {
    const eye = orbitEye(0.7, Math.PI / 2, 8, ORIGIN);
    expect(eye[0]).toBeCloseTo(0, 12);
    expect(eye[1]).toBeCloseTo(8, 12);
    expect(eye[2]).toBeCloseTo(0, 12);
  });

  it('distance from target is always dist', () => {
    const target: Vec3 = [1, -2, 3];
    const probes: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [0.3, 0.9],
      [Math.PI, -1.1],
      [-2.4, 1.4],
      [5.9, 1.5],
    ];
    for (const [az, el] of probes) {
      const dist = 12;
      const eye = orbitEye(az, el, dist, target);
      const d = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
      expect(d).toBeCloseTo(dist, 10);
    }
  });

  it('target offsets translate the eye', () => {
    const az = 0.4;
    const el = 0.2;
    const dist = 6;
    const eyeAtOrigin = orbitEye(az, el, dist, ORIGIN);
    const offset: Vec3 = [10, -4, 2];
    const eyeAtOffset = orbitEye(az, el, dist, offset);
    expect(eyeAtOffset[0]).toBeCloseTo(eyeAtOrigin[0] + offset[0], 10);
    expect(eyeAtOffset[1]).toBeCloseTo(eyeAtOrigin[1] + offset[1], 10);
    expect(eyeAtOffset[2]).toBeCloseTo(eyeAtOrigin[2] + offset[2], 10);
  });
});
