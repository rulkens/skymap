import { describe, it, expect } from 'vitest';
import { makeSyntheticGaussianCube } from '../../src/data/syntheticScalarField';
import { f16ToFloat } from '../../src/data/syntheticScalarField';

describe('synthetic Gaussian cube', () => {
  it('produces the requested dims', () => {
    const cube = makeSyntheticGaussianCube({ dims: 8, frameKind: 'equatorial-cartesian' });
    expect(cube.dims).toEqual([8, 8, 8]);
    expect(cube.voxels.length).toBe(8 * 8 * 8);
  });

  it('peaks at the centre', () => {
    const cube = makeSyntheticGaussianCube({ dims: 9, frameKind: 'equatorial-cartesian' });
    // Centre voxel index (4, 4, 4) of a 9³ cube; x-fastest layout.
    const centreIdx = 4 + 4 * 9 + 4 * 81;
    const centre = f16ToFloat(cube.voxels[centreIdx]!);
    // Edge voxel at (0,0,0).
    const edge = f16ToFloat(cube.voxels[0]!);
    expect(centre).toBeGreaterThan(edge);
    expect(centre).toBeGreaterThan(0.9);
    expect(edge).toBeLessThan(0.1);
  });

  it('is symmetric about the centre axes', () => {
    const cube = makeSyntheticGaussianCube({ dims: 9, frameKind: 'equatorial-cartesian' });
    // Compare (1,4,4) vs (7,4,4) — same distance from centre on x.
    const left = f16ToFloat(cube.voxels[1 + 4 * 9 + 4 * 81]!);
    const right = f16ToFloat(cube.voxels[7 + 4 * 9 + 4 * 81]!);
    expect(Math.abs(left - right)).toBeLessThan(0.01);
  });

  it('is centred at the world origin by construction', () => {
    const cube = makeSyntheticGaussianCube({ dims: 8, frameKind: 'equatorial-cartesian', boxSizeMpc: 200 });
    expect(cube.origin).toEqual([-100, -100, -100]);
    expect(cube.voxelSize).toBe(200 / 8);
  });
});
