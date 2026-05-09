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

  it('defaults to gaussian shape when shape is not provided', async () => {
    // Gaussian uses blue-purple palette; the two grids use viridis /
    // magma.  Asserting on paletteId is a cheap proxy for "the right
    // generator was called" without re-checking voxel patterns.
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher(
      { handle: 'h' },
      ctrl.signal,
      () => {},
    );
    expect(cube.paletteId).toBe('blue-purple');
  });

  it('dispatches to cartesian generator when shape=cartesian', async () => {
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher(
      { handle: 'h', shape: 'cartesian', dims: 8 },
      ctrl.signal,
      () => {},
    );
    expect(cube.paletteId).toBe('viridis');
    expect(cube.dims).toEqual([8, 8, 8]);
  });

  it('dispatches to spherical generator when shape=spherical', async () => {
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher(
      { handle: 'h', shape: 'spherical', dims: 8 },
      ctrl.signal,
      () => {},
    );
    expect(cube.paletteId).toBe('magma');
    expect(cube.dims).toEqual([8, 8, 8]);
  });
});
