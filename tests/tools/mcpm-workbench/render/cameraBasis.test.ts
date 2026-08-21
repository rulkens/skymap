import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import { cameraBasis } from '../../../../tools/mcpm-workbench/src/render/cameraBasis';
import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';

const dot = (a: readonly number[], b: readonly number[]): number =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

// Contents irrelevant this task — cameraBasis doesn't read box until F2.3.
const box: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [8, 8, 8],
  dims: [8, 8, 8],
  voxelSizeMpc: 1,
  rotation: [0, 0, 0, 1],
};

describe('cameraBasis', () => {
  it('stays finite and orthonormal when the camera looks straight down its own up axis', () => {
    // The pole case: forward parallel to up collapses forward x up, and an unguarded
    // normalize of that zero vector hands every downstream pass NaN positions.
    const { right, up, forward } = cameraBasis([0, 10, 0], [0, 0, 0], [0, 1, 0], box);

    for (const v of [right, up, forward]) {
      expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 6);
    }
    expect(dot(right, forward)).toBeCloseTo(0, 6);
    expect(dot(right, up)).toBeCloseTo(0, 6);
    expect(dot(up, forward)).toBeCloseTo(0, 6);
  });

  it('returns an orthonormal basis at a rotated box', () => {
    const rotatedBox: GridBox = { ...box, rotation: quatFromAxisAngle([0, 1, 0], Math.PI / 2) };
    const { right, up, forward } = cameraBasis([0, 3, 5], [0, 0, 0], [0, 1, 0], rotatedBox);

    for (const v of [right, up, forward]) {
      expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 6);
    }
    expect(dot(right, forward)).toBeCloseTo(0, 6);
    expect(dot(right, up)).toBeCloseTo(0, 6);
    expect(dot(up, forward)).toBeCloseTo(0, 6);
  });

  it('at a rotated box matches a hand-rotated expectation', () => {
    // eye=[0,0,5], target=origin, up=[0,1,0] gives the unrotated basis
    // forward=[0,0,-1], right=[1,0,0], up=[0,1,0] (right = normalize(forward × up),
    // up = right × forward).
    //
    // R⁻¹ here is -90° about Y, which maps (x,y,z) -> (-z, y, x) (same formula as
    // worldToBoxLocal.test.ts). Applying it:
    //   right=[1,0,0]  -> [0,0,1]
    //   up=[0,1,0]     -> [0,1,0]  (unchanged: Y rotation fixes the Y axis)
    //   forward=[0,0,-1] -> [1,0,0]
    const rotatedBox: GridBox = { ...box, rotation: quatFromAxisAngle([0, 1, 0], Math.PI / 2) };
    const { right, up, forward } = cameraBasis([0, 0, 5], [0, 0, 0], [0, 1, 0], rotatedBox);

    expect(right[0]).toBeCloseTo(0, 10);
    expect(right[1]).toBeCloseTo(0, 10);
    expect(right[2]).toBeCloseTo(1, 10);

    expect(up[0]).toBeCloseTo(0, 10);
    expect(up[1]).toBeCloseTo(1, 10);
    expect(up[2]).toBeCloseTo(0, 10);

    expect(forward[0]).toBeCloseTo(1, 10);
    expect(forward[1]).toBeCloseTo(0, 10);
    expect(forward[2]).toBeCloseTo(0, 10);
  });
});
