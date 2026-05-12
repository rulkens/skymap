/**
 * Unit test for mcpmFetcher: maps `req.tier` to the right filename and
 * decodes the response into a ScalarCube. We stub fetchWithProgress to
 * avoid a real network call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/services/loading/fetchWithProgress', () => ({
  dataUrl: (path: string) => `/data/${path}`,
  fetchWithProgress: vi.fn(),
}));

import { mcpmFetcher } from '../../../../src/services/loading/fetchers/mcpmFetcher';
import { encodeScalarField } from '../../../../src/data/scalarFieldFormat';
import { fetchWithProgress } from '../../../../src/services/loading/fetchWithProgress';
import type { ScalarCube } from '../../../../src/@types/data/ScalarCube';

const fakeCube: ScalarCube = {
  dims: [2, 2, 2],
  voxels: new Uint16Array(8),
  frameKind: 'equatorial-cartesian',
  origin: [0, 0, 0],
  voxelSize: 1,
  rotation: [0, 0, 0, 1],
  valueMin: 0,
  valueMax: 1,
};

describe('mcpmFetcher', () => {
  beforeEach(() => vi.mocked(fetchWithProgress).mockReset());

  it.each([
    ['small', 'mcpm-small.scfd'],
    ['medium', 'mcpm-medium.scfd'],
    ['large', 'mcpm-large.scfd'],
  ] as const)('fetches %s tier from %s', async (tier, expectedFilename) => {
    vi.mocked(fetchWithProgress).mockResolvedValueOnce(encodeScalarField(fakeCube));
    const cube = await mcpmFetcher({ tier }, new AbortController().signal, () => {});
    expect(fetchWithProgress).toHaveBeenCalledOnce();
    const url = vi.mocked(fetchWithProgress).mock.calls[0]![0];
    expect(url).toContain(expectedFilename);
    expect(cube.dims).toEqual([2, 2, 2]);
    expect(cube.frameKind).toBe('equatorial-cartesian');
  });
});
