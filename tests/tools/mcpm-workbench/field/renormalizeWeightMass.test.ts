/**
 * renormalizeWeightMass — task S14 fix round 1. Box fixture matches
 * cullPointsToBox.test.ts: origin [-8,-8,-8], voxelSizeMpc 2, dims [8,8,8].
 */
import { describe, expect, it } from 'vitest';
import { cullPointsToBox } from '../../../../tools/mcpm-workbench/src/field/cullPointsToBox';
import {
  deriveAgentWeights,
  TOTAL_WEIGHT_MASS,
} from '../../../../tools/mcpm-workbench/src/field/deriveAgentWeights';
import { renormalizeWeightMass } from '../../../../tools/mcpm-workbench/src/field/renormalizeWeightMass';
import { Source } from '../../../../src/data/source';
import type { CatalogPoints } from '../../../../tools/mcpm-workbench/@types/CatalogPoints';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';

const box: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [16, 16, 16],
  dims: [8, 8, 8],
  voxelSizeMpc: 2,
};

const sum = (a: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return s;
};

describe('renormalizeWeightMass', () => {
  it('rescales an arbitrary weight array to sum to TOTAL_WEIGHT_MASS', () => {
    const input = new Float32Array([1, 2, 3, 4]);
    const result = renormalizeWeightMass(input);
    expect(sum(result)).toBeCloseTo(TOTAL_WEIGHT_MASS, 3);
  });

  it('preserves relative proportions between weights', () => {
    const input = new Float32Array([1, 3]);
    const result = renormalizeWeightMass(input);
    expect(result[1]! / result[0]!).toBeCloseTo(3, 5);
  });

  it('passes an all-zero array through unchanged rather than dividing by zero', () => {
    const input = new Float32Array([0, 0, 0]);
    const result = renormalizeWeightMass(input);
    expect(Array.from(result)).toEqual([0, 0, 0]);
  });

  it(
    "restores the overlay's mean-1 invariant for a box that crops the catalog " +
      '(the exact scenario galaxyOverlayPass.weightScale assumes)',
    () => {
      // Real flow order: deriveAgentWeights runs on the RAW pre-cull masses (Viewport.tsx),
      // then cullPointsToBox crops to the box — mirroring createMcpmHarness.
      const log10Mass = new Float32Array([9, 10, 11, 12, 8, 10.5]);
      const weights = deriveAgentWeights(log10Mass, 'stellarMass');
      expect(sum(weights.weights)).toBeCloseTo(TOTAL_WEIGHT_MASS, 1); // sanity: raw invariant holds

      // Only 3 of the 6 points land in [-8,8) on every axis; the other 3 sit far outside.
      const positions = [
        -2,
        -6,
        2,
        0,
        0,
        0,
        6,
        -6,
        -6, // in box
        100,
        100,
        100,
        -100,
        -100,
        -100,
        200,
        200,
        200, // outside
      ];
      const points: CatalogPoints = {
        positions: new Float32Array(positions),
        log10StellarMass: log10Mass,
        count: 6,
        sources: [Source.SDSS],
      };

      const culled = cullPointsToBox(points, weights, box);
      expect(culled.points.count).toBe(3); // sanity: the crop actually dropped points

      // The bug this test pins: cullPointsToBox alone leaves the culled subset's mass
      // BELOW TOTAL_WEIGHT_MASS, which is what silently dimmed the Galaxies overlay.
      expect(sum(culled.weights.weights)).toBeLessThan(TOTAL_WEIGHT_MASS * 0.9);

      // The fix: renormalizing the culled set restores exactly the invariant
      // galaxyOverlayPass's `weightScale = nDataPoints/TOTAL_WEIGHT_MASS` requires.
      const seeded = renormalizeWeightMass(culled.weights.weights);
      expect(sum(seeded)).toBeCloseTo(TOTAL_WEIGHT_MASS, 1);
    },
  );
});
