/**
 * orientationFrames — the four orientation bases must each be a proper rotation
 * (orthonormal, right-handed) and must carry the correct pole in their middle
 * column, because the orbit camera reads that middle column as its local +Y
 * "up". These tests check those two properties by independent derivation rather
 * than restating the matrix literals: orthonormality/det from the assembled
 * matrices, and each pole against a from-scratch spherical/column computation
 * that catches a transcribed obliquity, a wrong pole column, or a sign flip.
 */
import { describe, expect, it } from 'vitest';

import type { OrientationFrameId } from '../../../src/@types/camera/OrientationFrameId';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { SG_TO_EQ_MATRIX } from '../../../src/data/superGalacticTransform';
import { planeFrameFromPole } from '../../../src/data/bodies/orbitPlaneFrames';
import { eqRaDecToUnitCart } from '../../../src/utils/math/eqRaDecToUnitCart';

const IDS: OrientationFrameId[] = ['equatorial', 'ecliptic', 'galactic', 'supergalactic'];

const col = (m: Mat3, c: number): Vec3 => [m[c * 3]!, m[c * 3 + 1]!, m[c * 3 + 2]!];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const det = (m: Mat3): number => dot(col(m, 0), cross(col(m, 1), col(m, 2)));

describe('ORIENTATION_FRAMES', () => {
  it('every registry basis is orthonormal', () => {
    for (const id of IDS) {
      const m = ORIENTATION_FRAMES[id];
      const c0 = col(m, 0);
      const c1 = col(m, 1);
      const c2 = col(m, 2);
      expect(Math.hypot(...c0), `${id} col0 unit`).toBeCloseTo(1, 6);
      expect(Math.hypot(...c1), `${id} col1 unit`).toBeCloseTo(1, 6);
      expect(Math.hypot(...c2), `${id} col2 unit`).toBeCloseTo(1, 6);
      expect(dot(c0, c1), `${id} col0·col1`).toBeCloseTo(0, 6);
      expect(dot(c0, c2), `${id} col0·col2`).toBeCloseTo(0, 6);
      expect(dot(c1, c2), `${id} col1·col2`).toBeCloseTo(0, 6);
    }
  });

  it('every registry basis is right-handed (det = +1)', () => {
    for (const id of IDS) {
      expect(det(ORIENTATION_FRAMES[id]), `${id} det`).toBeCloseTo(1, 6);
    }
  });

  it('ecliptic pole matches the obliquity pole from planeFrameFromPole', () => {
    // 66.56° = 90° − 23.44°: the ecliptic north pole in equatorial RA/Dec.
    const pole = planeFrameFromPole(270, 66.56).normal;
    const mid = col(ORIENTATION_FRAMES.ecliptic, 1);
    expect(mid[0]).toBeCloseTo(pole[0], 4);
    expect(mid[1]).toBeCloseTo(pole[1], 4);
    expect(mid[2]).toBeCloseTo(pole[2], 4);
  });

  it('galactic pole matches the NGP from eqRaDecToUnitCart', () => {
    const ngp = eqRaDecToUnitCart(192.8595, 27.1283);
    const mid = col(ORIENTATION_FRAMES.galactic, 1);
    expect(mid[0]).toBeCloseTo(ngp[0], 4);
    expect(mid[1]).toBeCloseTo(ngp[1], 4);
    expect(mid[2]).toBeCloseTo(ngp[2], 4);
  });

  it('supergalactic pole is the SGZ column of SG_TO_EQ_MATRIX', () => {
    const mid = col(ORIENTATION_FRAMES.supergalactic, 1);
    expect(mid[0]).toBeCloseTo(SG_TO_EQ_MATRIX[6]!, 6);
    expect(mid[1]).toBeCloseTo(SG_TO_EQ_MATRIX[7]!, 6);
    expect(mid[2]).toBeCloseTo(SG_TO_EQ_MATRIX[8]!, 6);
  });
});
