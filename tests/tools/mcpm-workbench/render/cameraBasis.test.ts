import { describe, expect, it } from 'vitest';
import { cameraBasis } from '../../../../tools/mcpm-workbench/src/render/cameraBasis';

const dot = (a: readonly number[], b: readonly number[]): number =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

describe('cameraBasis', () => {
  it('stays finite and orthonormal when the camera looks straight down its own up axis', () => {
    // The pole case: forward parallel to up collapses forward x up, and an unguarded
    // normalize of that zero vector hands every downstream pass NaN positions.
    const { right, up, forward } = cameraBasis([0, 10, 0], [0, 0, 0], [0, 1, 0]);

    for (const v of [right, up, forward]) {
      expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 6);
    }
    expect(dot(right, forward)).toBeCloseTo(0, 6);
    expect(dot(right, up)).toBeCloseTo(0, 6);
    expect(dot(up, forward)).toBeCloseTo(0, 6);
  });
});
