/**
 * lensShift — the projection-matrix lens shift that re-centres the galaxy
 * in the un-panelled screen area, extracted from galaxy-engine.js:285.
 */
import { describe, expect, it } from 'vitest';
import { lensShift } from '../../../../../tools/galaxy-renderer/src/engine/camera/lensShift';

describe('lensShift', () => {
  it('symmetric insets give zero shift', () => {
    expect(lensShift(200, 200, 1000)).toBe(0);
    expect(lensShift(0, 0, 1000)).toBe(0);
  });

  it('a wider right panel shifts positive', () => {
    expect(lensShift(0, 390, 1000)).toBeGreaterThan(0);
    expect(lensShift(390, 0, 1000)).toBeLessThan(0);
  });

  it('magnitude is the inset delta over client width', () => {
    expect(lensShift(0, 390, 1000)).toBeCloseTo(390 / 1000, 12);
    expect(lensShift(390, 0, 1000)).toBeCloseTo(-390 / 1000, 12);
  });

  it('zero client width does not divide by zero', () => {
    expect(lensShift(0, 390, 0)).toBeCloseTo(390 / 1, 12);
    expect(Number.isFinite(lensShift(0, 390, 0))).toBe(true);
  });
});
