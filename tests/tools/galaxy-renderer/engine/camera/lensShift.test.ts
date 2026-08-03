/**
 * lensShift — the projection-matrix lens shift that re-centres the galaxy
 * in the un-panelled screen area, extracted from galaxy-engine.js:285.
 */
import { describe, expect, it } from 'vitest';
import { lensShift } from '../../../../../tools/galaxy-renderer/src/engine/camera/lensShift';

describe('lensShift', () => {
  it('magnitude is the inset delta over client width', () => {
    expect(lensShift(0, 390, 1000)).toBeCloseTo(390 / 1000, 12);
    expect(lensShift(390, 0, 1000)).toBeCloseTo(-390 / 1000, 12);
  });

  it('clamps the divisor, so a zero-width canvas yields a finite shift', () => {
    // A canvas laid out at 0 px (display:none, pre-layout) would otherwise put
    // an Infinity in proj[8] and blank the frame.
    expect(lensShift(0, 390, 0)).toBe(390);
  });
});
