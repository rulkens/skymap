import { describe, it, expect } from 'vitest';
import { syntheticVolumeFetcher } from '../../../../src/services/loading/fetchers/syntheticVolumeFetcher';

describe('syntheticVolumeFetcher', () => {
  it('resolves to a ScalarCube of the requested dims', async () => {
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher(
      { handle: 'debug-gaussian', dims: 32, boxSizeMpc: 200 },
      ctrl.signal,
      () => {},
    );
    expect(cube.dims).toEqual([32, 32, 32]);
    expect(cube.voxels.length).toBe(32 * 32 * 32);
    expect(cube.voxelSize).toBe(200 / 32);
  });

  it('respects defaults when dims/boxSizeMpc are not provided', async () => {
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher(
      { handle: 'debug-gaussian' },
      ctrl.signal,
      () => {},
    );
    expect(cube.dims).toEqual([64, 64, 64]);
  });
});
