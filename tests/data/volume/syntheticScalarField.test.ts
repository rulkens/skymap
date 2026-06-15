import { describe, it, expect } from 'vitest';
import {
  makeSyntheticGaussianCube,
  makeCartesianGridCube,
  makeSphericalGridCube,
} from '../../../src/data/volume/syntheticScalarField';
import { f16ToFloat } from '../../../src/utils/math/f16ToFloat';

// Helper: index into the x-fastest, y-medium, z-slowest voxel array.
function idx(x: number, y: number, z: number, dims: number): number {
  return x + y * dims + z * dims * dims;
}

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
    const cube = makeSyntheticGaussianCube({
      dims: 8,
      frameKind: 'equatorial-cartesian',
      boxSizeMpc: 200,
    });
    expect(cube.origin).toEqual([-100, -100, -100]);
    expect(cube.voxelSize).toBe(200 / 8);
  });
});

describe('cartesian grid cube', () => {
  it('produces the requested dims', () => {
    // Palette + densityScale are not cube properties — they live in
    // `volumeFieldDefaults.ts` keyed by the renderer's handle.  The
    // generator's job here is purely to produce a valid voxel grid.
    const cube = makeCartesianGridCube({ dims: 8 });
    expect(cube.dims).toEqual([8, 8, 8]);
    expect(cube.voxels.length).toBe(8 * 8 * 8);
  });

  it('peaks at the world origin (which sits on a grid plane on every axis)', () => {
    // 9³ box of 400 Mpc → voxelSize ≈ 44.44.  The CENTRE voxel (4, 4, 4)
    // has world position (-200 + 4.5*44.44, ...) ≈ (0, 0, 0).  With
    // gridSpacing=50, the origin is on a grid plane on every axis, so
    // the falloff there is exp(0) = 1.  Picking odd dims is the trick
    // — for even dims, no voxel centre lands exactly on the origin
    // because centres are at half-voxel offsets from corners.
    const cube = makeCartesianGridCube({ dims: 9, boxSizeMpc: 400, gridSpacingMpc: 50 });
    const centre = f16ToFloat(cube.voxels[idx(4, 4, 4, 9)]!);
    expect(centre).toBeGreaterThan(0.99);
  });

  it('has near-zero values deep inside a grid cell', () => {
    // 64³ at 400 Mpc → voxelSize 6.25 Mpc; gridSpacing 50 Mpc.  Voxel
    // centres span [-196.875, 196.875].  A voxel near a half-spacing
    // offset from a plane (12.5 Mpc < halfSpacing < 25 Mpc) will have
    // far-from-plane coords on all three axes.
    const cube = makeCartesianGridCube({ dims: 64, boxSizeMpc: 400, gridSpacingMpc: 50 });
    // Voxel (4, 4, 4) → world (-196.875+4·6.25, ...) = (-171.875, -171.875, -171.875).
    // Distance to nearest plane (-200 or -150) is min(28.125, 21.875) = 21.875 Mpc.
    // With sigma=3, falloff = exp(-21.875² / 2·9) ≈ exp(-26.6) ≈ 0 — well below 0.01.
    const v = f16ToFloat(cube.voxels[idx(4, 4, 4, 64)]!);
    expect(v).toBeLessThan(0.01);
  });

  it('is symmetric about the box centre', () => {
    // For an even-dim cube, voxel x and voxel (dims-1-x) are mirror
    // images about the centre.  The grid is symmetric, so their values
    // should agree.
    const cube = makeCartesianGridCube({ dims: 16, boxSizeMpc: 400, gridSpacingMpc: 50 });
    for (let x = 0; x < 8; x++) {
      const left = f16ToFloat(cube.voxels[idx(x, 8, 8, 16)]!);
      const right = f16ToFloat(cube.voxels[idx(15 - x, 8, 8, 16)]!);
      expect(Math.abs(left - right)).toBeLessThan(0.02);
    }
  });
});

describe('spherical grid cube', () => {
  it('produces the requested dims', () => {
    // Palette + densityScale are not cube properties; see the
    // companion comment on the cartesian generator's test above.
    const cube = makeSphericalGridCube({ dims: 8 });
    expect(cube.dims).toEqual([8, 8, 8]);
    expect(cube.voxels.length).toBe(8 * 8 * 8);
  });

  it('has high value near the world origin (all three spokes pass through it)', () => {
    // 16³ at 400 Mpc → voxelSize 25.  The voxel nearest the origin is
    // (8, 8, 8) with world position (12.5, 12.5, 12.5).
    // r = sqrt(3·12.5²) ≈ 21.65 Mpc — between shells 0 and 50.
    // Distance to nearest shell: r mod 50 = 21.65 → distance = 21.65.
    // Spoke perpendicular distances: dToX = sqrt(12.5²+12.5²) ≈ 17.7,
    // similarly for dToY, dToZ — all far from any axis with default
    // spokeSigma=2.  So the voxel at (8,8,8) is NOT bright.
    //
    // But voxel (8, 8, 7) has wz = -12.5, wy = 12.5, wx = 12.5;
    // dToZ = sqrt(12.5² + 12.5²) = 17.7 → also off any spoke.
    //
    // A voxel ON the +x spoke would have wy ≈ 0 and wz ≈ 0 —
    // impossible at even-dim 16 because no voxel centre has wy=0
    // (centres are at odd multiples of voxelSize/2 = 12.5).  Use
    // odd dims to get a voxel centred exactly on the origin.
    const cube = makeSphericalGridCube({ dims: 17, boxSizeMpc: 400 });
    // dims=17, voxelSize ≈ 23.5; centre voxel (8,8,8) has world
    // position (0, 0, 0) — exactly on every spoke and on the r=0
    // degenerate "shell".  Spoke contribution at origin = 1.
    const centre = f16ToFloat(cube.voxels[idx(8, 8, 8, 17)]!);
    expect(centre).toBeGreaterThan(0.9);
  });

  it('has voxels near the +X spoke that are bright', () => {
    // Voxel along the +X axis with y, z ≈ 0: pick a voxel at
    // (centre_x + offset, centre_y, centre_z) of an odd-dim cube.
    const cube = makeSphericalGridCube({ dims: 17, boxSizeMpc: 400 });
    // (10, 8, 8) — world position roughly (47, 0, 0).
    // dToX = sqrt(0² + 0²) = 0 → spoke value = 1.  Shell distance
    // from r ≈ 47 to nearest shell (50) = 3 → shell value = exp(-9/18) ≈ 0.6.
    // max = 1.0 (the spoke wins).
    const v = f16ToFloat(cube.voxels[idx(10, 8, 8, 17)]!);
    expect(v).toBeGreaterThan(0.9);
  });

  it('is octahedrally symmetric (any axis flip preserves values)', () => {
    // The spheres + axis spokes are symmetric under any sign flip on
    // any axis.  So voxel (x, y, z) and (dims-1-x, y, z) should have
    // equal values for an even-dim cube.
    const cube = makeSphericalGridCube({ dims: 16, boxSizeMpc: 400 });
    for (let i = 0; i < 8; i++) {
      const a = f16ToFloat(cube.voxels[idx(i, 5, 5, 16)]!);
      const b = f16ToFloat(cube.voxels[idx(15 - i, 5, 5, 16)]!);
      expect(Math.abs(a - b)).toBeLessThan(0.02);
    }
  });
});
