import { describe, it, expect } from 'vitest';
import { ECLIPTIC_BASIS } from '../../../src/data/bodies/eclipticBasis';

const hypot3 = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

const dot3 = (a: readonly [number, number, number], b: readonly [number, number, number]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('ECLIPTIC_BASIS', () => {
  it('yAxis is unit-length', () => {
    expect(hypot3(ECLIPTIC_BASIS.yAxis)).toBeCloseTo(1, 12);
  });

  it('normal is unit-length', () => {
    expect(hypot3(ECLIPTIC_BASIS.normal)).toBeCloseTo(1, 12);
  });

  it('normal is perpendicular to frame +x', () => {
    expect(dot3(ECLIPTIC_BASIS.normal, [1, 0, 0])).toBeCloseTo(0, 12);
  });

  it('normal is perpendicular to yAxis', () => {
    expect(dot3(ECLIPTIC_BASIS.normal, ECLIPTIC_BASIS.yAxis)).toBeCloseTo(0, 12);
  });

  it('the angle between normal and frame +z equals the obliquity', () => {
    // Both are unit vectors, so the dot product is cos(angle) directly.
    const cosAngle = dot3(ECLIPTIC_BASIS.normal, [0, 0, 1]);
    expect(Math.acos(cosAngle)).toBeCloseTo(ECLIPTIC_BASIS.obliquityRad, 12);
  });
});
