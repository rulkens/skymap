/**
 * buildOverlayCatalog — task S16. Same 6-point / 3-in-box fixture as
 * cullPointsToBox.test.ts and renormalizeWeightMass.test.ts's cropping-box
 * case: origin [-8,-8,-8], voxelSizeMpc 2, dims [8,8,8].
 */
import { describe, expect, it } from 'vitest';
import { buildOverlayCatalog } from '../../../../tools/mcpm-workbench/src/field/buildOverlayCatalog';
import { cullPointsToBox } from '../../../../tools/mcpm-workbench/src/field/cullPointsToBox';
import {
  deriveAgentWeights,
  TOTAL_WEIGHT_MASS,
} from '../../../../tools/mcpm-workbench/src/field/deriveAgentWeights';
import { worldToVoxel } from '../../../../tools/mcpm-workbench/src/field/worldToVoxel';
import { Source } from '../../../../src/data/source';
import type { CatalogPoints } from '../../../../tools/mcpm-workbench/@types/CatalogPoints';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';

const box: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [16, 16, 16],
  dims: [8, 8, 8],
  voxelSizeMpc: 2,
  rotation: [0, 0, 0, 1],
};

const sum = (a: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return s;
};

// Only 3 of the 6 points land in [-8,8) on every axis; the other 3 sit far outside —
// exactly the fixture cullPointsToBox.test.ts drops to 3.
const log10Mass = new Float32Array([9, 10, 11, 12, 8, 10.5]);
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
const weights = deriveAgentWeights(log10Mass, 'stellarMass');

describe('buildOverlayCatalog', () => {
  it('draws every RAW loaded point, not the box-culled subset the sim seeds from', () => {
    const overlay = buildOverlayCatalog(points, weights, box);
    expect(overlay.x.length).toBe(6);
    expect(overlay.y.length).toBe(6);
    expect(overlay.z.length).toBe(6);
    expect(overlay.weight.length).toBe(6);

    // Sanity: the sim's own seed set stays culled to 3 — this is the ruling's
    // "two different sets by construction", not a change to cullPointsToBox.
    const culled = cullPointsToBox(points, weights, box);
    expect(culled.points.count).toBe(3);
  });

  it('normalizes weights to mean 1 over the RAW set (sum to TOTAL_WEIGHT_MASS across all 6, not just the 3 in-box)', () => {
    const overlay = buildOverlayCatalog(points, weights, box);
    expect(sum(overlay.weight)).toBeCloseTo(TOTAL_WEIGHT_MASS, 1);
  });

  it('projects an out-of-box point to its own out-of-[0,dims) voxel coordinate rather than dropping it', () => {
    const overlay = buildOverlayCatalog(points, weights, box);
    const [ex, ey, ez] = worldToVoxel(box, [-100, -100, -100]); // point index 4, outside the box
    expect(overlay.x[4]).toBeCloseTo(ex, 5);
    expect(overlay.y[4]).toBeCloseTo(ey, 5);
    expect(overlay.z[4]).toBeCloseTo(ez, 5);
    expect(ex).toBeLessThan(0); // sanity: genuinely outside [0, dims)
  });
});
