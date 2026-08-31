/**
 * boxLocalToWorld — same box as worldToBoxLocal.test.ts, so both files agree
 * on what "the zero vector" and "a known point" hand-compute to.
 */
import { describe, expect, it } from 'vitest';
import { boxLocalToWorld } from '../../../../tools/mcpm-workbench/src/field/boxLocalToWorld';
import { worldToBoxLocal } from '../../../../tools/mcpm-workbench/src/field/worldToBoxLocal';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';

const box: GridBox = {
  centerMpc: [10, -4, 6],
  sizeMpc: [24, 16, 8],
  dims: [24, 16, 8],
  voxelSizeMpc: 1,
  rotation: [0, 0, 0, 1],
};

const rotatedBox: GridBox = { ...box, rotation: quatFromAxisAngle([0, 1, 0], Math.PI / 2) };

describe('boxLocalToWorld', () => {
  it('maps the zero vector back to the box lower corner', () => {
    expect(boxLocalToWorld(box, [0, 0, 0])).toEqual([-2, -12, 2]);
  });

  it('is the exact inverse of worldToBoxLocal for several points inside and outside the box', () => {
    const points: Array<[number, number, number]> = [
      [10, -4, 6], // centre
      [-2, -12, 2], // lower corner
      [22, 4, 10], // upper corner
      [50, 50, -50], // well outside the box
    ];
    for (const p of points) {
      expect(boxLocalToWorld(box, worldToBoxLocal(box, p))).toEqual(p);
    }
  });

  it('is the (near-)exact inverse of worldToBoxLocal under a non-identity rotation', () => {
    const points: Array<[number, number, number]> = [
      [10, -4, 6], // centre
      [-2, -12, 2], // lower corner
      [22, 4, 10], // upper corner
      [50, 50, -50], // well outside the box
    ];
    for (const p of points) {
      const roundTripped = boxLocalToWorld(rotatedBox, worldToBoxLocal(rotatedBox, p));
      expect(roundTripped[0]).toBeCloseTo(p[0], 10);
      expect(roundTripped[1]).toBeCloseTo(p[1], 10);
      expect(roundTripped[2]).toBeCloseTo(p[2], 10);
    }
  });
});
