import { describe, it, expect } from 'vitest';
import { syntheticVolumeFetcher } from '../../../../src/services/loading/fetchers/syntheticVolumeFetcher';
import { f16ToFloat } from '../../../../src/utils/math/f16ToFloat';

describe('syntheticVolumeFetcher', () => {
  it('resolves to a ScalarCube of the requested dims', async () => {
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher(
      { id: 'debug-gaussian', dims: 32, boxSizeMpc: 200 },
      ctrl.signal,
      () => {},
    );
    expect(cube.dims).toEqual([32, 32, 32]);
    expect(cube.voxels.length).toBe(32 * 32 * 32);
    expect(cube.voxelSize).toBe(200 / 32);
  });

  it('respects defaults when dims/boxSizeMpc are not provided', async () => {
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher({ id: 'debug-gaussian' }, ctrl.signal, () => {});
    expect(cube.dims).toEqual([64, 64, 64]);
  });

  it('defaults to gaussian shape when shape is not provided', async () => {
    // SCFD v2 stripped paletteId from cubes, so we can't use palette as
    // the "which generator ran" proxy anymore.  Instead probe the centre
    // voxel: for an even-dimensioned Gaussian (dims=64 default) no voxel
    // sits exactly at the peak, but the four around the centre still
    // approach 1.0 — well above the < 0.1 range a Cartesian or spherical
    // grid would yield at the same coordinate (both have geometric
    // structure that's near-zero away from a grid plane / shell / spoke).
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher({ id: 'h' }, ctrl.signal, () => {});
    const dims = cube.dims[0];
    const centreIdx = dims / 2 + (dims / 2) * dims + (dims / 2) * dims * dims;
    const centreValue = f16ToFloat(cube.voxels[centreIdx]!);
    expect(centreValue).toBeGreaterThan(0.5);
  });
});
