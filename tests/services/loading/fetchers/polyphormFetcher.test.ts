/**
 * Unit test for polyphormFetcher: maps `req.tier` to the right filename and
 * decodes the response into a ScalarCube. We stub fetchWithProgress to
 * avoid a real network call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/services/loading/fetchWithProgress', () => ({
  dataUrl: (path: string) => `/data/${path}`,
  fetchWithProgress: vi.fn(),
}));

import { polyphormFetcher } from '../../../../src/services/loading/fetchers/polyphormFetcher';
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

describe('polyphormFetcher', () => {
  beforeEach(() => vi.mocked(fetchWithProgress).mockReset());

  it.each([
    ['small', 'polyphorm-2mrs-small.scfd'],
    ['medium', 'polyphorm-2mrs-medium.scfd'],
    ['large', 'polyphorm-2mrs-large.scfd'],
  ] as const)('fetches %s tier from %s', async (tier, expectedFilename) => {
    vi.mocked(fetchWithProgress).mockResolvedValueOnce(encodeScalarField(fakeCube));
    const cube = await polyphormFetcher({ tier }, new AbortController().signal, () => {});
    expect(fetchWithProgress).toHaveBeenCalledOnce();
    const url = vi.mocked(fetchWithProgress).mock.calls[0]![0];
    expect(url).toContain(expectedFilename);
    expect(cube.dims).toEqual([2, 2, 2]);
    expect(cube.frameKind).toBe('equatorial-cartesian');
  });
});
