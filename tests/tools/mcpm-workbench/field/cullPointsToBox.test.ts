/**
 * cullPointsToBox — task S14. Same box fixture as worldToVoxel.test.ts:
 * origin [-8,-8,-8], voxelSizeMpc 2, dims [8,8,8] -> voxel range [0,8) per axis.
 */
import { describe, expect, it } from 'vitest';
import { cullPointsToBox } from '../../../../tools/mcpm-workbench/src/field/cullPointsToBox';
import { Source } from '../../../../src/data/source';
import type { AgentWeights } from '../../../../tools/mcpm-workbench/@types/AgentWeights';
import type { CatalogPoints } from '../../../../tools/mcpm-workbench/@types/CatalogPoints';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';

const box: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [16, 16, 16],
  dims: [8, 8, 8],
  voxelSizeMpc: 2,
};

function pointsFrom(positions: readonly number[]): CatalogPoints {
  const count = positions.length / 3;
  return {
    positions: new Float32Array(positions),
    log10StellarMass: new Float32Array(count).fill(10),
    count,
    sources: [Source.SDSS],
  };
}

describe('cullPointsToBox', () => {
  it('keeps points strictly inside the box and drops points outside it', () => {
    // p=[-2,-6,2] -> voxel [3,1,5] (worldToVoxel.test.ts), well inside [0,8).
    // p=[100,100,100] -> far outside every axis.
    const points = pointsFrom([-2, -6, 2, 100, 100, 100]);
    const weights: AgentWeights = {
      weights: new Float32Array([1, 2]),
      nanCount: 0,
      medianLog10Mass: 10,
    };

    const culled = cullPointsToBox(points, weights, box);

    expect(culled.points.count).toBe(1);
    expect(Array.from(culled.points.positions)).toEqual([-2, -6, 2]);
  });

  it('keeps the boundary voxel dims-1 and drops a point landing exactly at dims', () => {
    // origin=[-8,-8,-8], voxelSize=2. v=dims-1=7 at x=-8+7*2=6 (kept: 7<8).
    // v=dims=8 at x=-8+8*2=8 (dropped: 8 is not < 8).
    const kept: [number, number, number] = [6, -6, -6]; // voxel x = 7
    const dropped: [number, number, number] = [8, -6, -6]; // voxel x = 8
    const points = pointsFrom([...kept, ...dropped]);
    const weights: AgentWeights = {
      weights: new Float32Array([5, 9]),
      nanCount: 0,
      medianLog10Mass: 10,
    };

    const culled = cullPointsToBox(points, weights, box);

    expect(culled.points.count).toBe(1);
    expect(Array.from(culled.points.positions)).toEqual(kept);
  });

  it('filters the weights array with the same mask, preserving point<->weight pairing', () => {
    const inBox1: [number, number, number] = [-2, -6, 2];
    const outside: [number, number, number] = [100, 100, 100];
    const inBox2: [number, number, number] = [0, 0, 0];
    const points = pointsFrom([...inBox1, ...outside, ...inBox2]);
    const weights: AgentWeights = {
      weights: new Float32Array([11, 22, 33]),
      nanCount: 0,
      medianLog10Mass: 10,
    };

    const culled = cullPointsToBox(points, weights, box);

    expect(culled.points.count).toBe(2);
    expect(Array.from(culled.weights.weights)).toEqual([11, 33]);
  });

  it('passes nanCount and medianLog10Mass through unchanged', () => {
    const points = pointsFrom([-2, -6, 2]);
    const weights: AgentWeights = {
      weights: new Float32Array([1]),
      nanCount: 3,
      medianLog10Mass: 9.5,
    };

    const culled = cullPointsToBox(points, weights, box);

    expect(culled.weights.nanCount).toBe(3);
    expect(culled.weights.medianLog10Mass).toBe(9.5);
  });

  it('returns a zero-count result when every point is outside the box', () => {
    const points = pointsFrom([100, 100, 100, -100, -100, -100]);
    const weights: AgentWeights = {
      weights: new Float32Array([1, 2]),
      nanCount: 0,
      medianLog10Mass: 10,
    };

    const culled = cullPointsToBox(points, weights, box);

    expect(culled.points.count).toBe(0);
    expect(culled.weights.weights.length).toBe(0);
  });
});
