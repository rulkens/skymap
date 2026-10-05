/**
 * cosmicWebDensityFetcher — maps a request to the right `.scfd` filename and
 * decodes the response into a ScalarCube. fetchWithProgress is stubbed, so no
 * network call is made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/services/loading/fetchWithProgress', () => ({
  dataUrl: (path: string) => `/data/${path}`,
  fetchWithProgress: vi.fn(),
}));

import { cosmicWebDensityFetcher } from '../../../../src/layers/cosmicWebDensity/load/cosmicWebDensityFetcher';
import { encodeScalarField } from '../../../../src/data/volume/scalarFieldFormat';
import { fetchWithProgress } from '../../../../src/services/loading/fetchWithProgress';
import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';

const fakeCube: ScalarCube = {
  dims: [2, 2, 2],
  channels: 1,
  voxels: new Uint16Array(8),
  frameKind: 'equatorial-cartesian',
  origin: [0, 0, 0],
  voxelSize: 1,
  rotation: [0, 0, 0, 1],
  valueMin: 0,
  valueMax: 1,
};

/** The URL of the one fetch the fetcher made. */
function fetchedUrl(): string {
  expect(fetchWithProgress).toHaveBeenCalledOnce();
  return vi.mocked(fetchWithProgress).mock.calls[0]![0];
}

describe('cosmicWebDensityFetcher', () => {
  beforeEach(() => {
    vi.mocked(fetchWithProgress).mockReset();
    vi.mocked(fetchWithProgress).mockResolvedValueOnce(encodeScalarField(fakeCube));
  });

  it('fetches a tiered request from <binBaseName>-<tier>.scfd', async () => {
    const cube = await cosmicWebDensityFetcher(
      { binBaseName: 'mcpm', tier: 'small' },
      new AbortController().signal,
      () => {},
    );
    expect(fetchedUrl().endsWith('/mcpm-small.scfd')).toBe(true);
    expect(cube.dims).toEqual([2, 2, 2]);
    expect(cube.frameKind).toBe('equatorial-cartesian');
  });

  it('fetches an untiered request from <binBaseName>.scfd', async () => {
    await cosmicWebDensityFetcher(
      { binBaseName: 'mcpm-workbench' },
      new AbortController().signal,
      () => {},
    );
    expect(fetchedUrl().endsWith('/mcpm-workbench.scfd')).toBe(true);
  });
});
