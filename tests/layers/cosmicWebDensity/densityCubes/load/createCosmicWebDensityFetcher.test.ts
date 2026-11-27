/**
 * createCosmicWebDensityFetcher — an scfd request fetches `<binBaseName>.scfd` and uploads the
 * decoded cube into one 3D texture. fetchWithProgress is stubbed, so no network call is made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../packages/shared/src/services/loading/fetchWithProgress', () => ({
  dataUrl: (path: string) => `/data/${path}`,
  fetchWithProgress: vi.fn(),
}));

import { createCosmicWebDensityFetcher } from '../../../../../src/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensityFetcher';
import { encodeScalarField } from '../../../../../packages/shared/src/data/volume/scalarFieldFormat';
import { fetchWithProgress } from '../../../../../packages/shared/src/services/loading/fetchWithProgress';
import type { ScalarCube } from '../../../../../packages/shared/src/@types/data/volume/ScalarCube';

const fakeCube: ScalarCube = {
  dims: [2, 3, 4],
  channels: 1,
  voxels: new Uint16Array(24),
  frameKind: 'equatorial-cartesian',
  origin: [0, 0, 0],
  voxelSize: 1,
  rotation: [0, 0, 0, 1],
  valueMin: 0,
  valueMax: 1,
};

function mockDevice() {
  return {
    createTexture: vi.fn(() => ({})),
    queue: { writeTexture: vi.fn() },
  };
}

/** The URL of the one fetch the fetcher made. */
function fetchedUrl(): string {
  expect(fetchWithProgress).toHaveBeenCalledOnce();
  return vi.mocked(fetchWithProgress).mock.calls[0]![0];
}

describe('createCosmicWebDensityFetcher', () => {
  beforeEach(() => {
    vi.mocked(fetchWithProgress).mockReset();
    vi.mocked(fetchWithProgress).mockResolvedValueOnce(encodeScalarField(fakeCube));
  });

  it('fetches an scfd request from <binBaseName>.scfd into one r16float 3D texture', async () => {
    const device = mockDevice();
    const volume = await createCosmicWebDensityFetcher(device as unknown as GPUDevice)(
      { storage: 'scfd', binBaseName: 'mcpm-workbench' },
      new AbortController().signal,
      () => {},
    );
    expect(fetchedUrl().endsWith('/mcpm-workbench.scfd')).toBe(true);
    expect(device.createTexture).toHaveBeenCalledOnce();
    expect(device.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'r16float',
        dimension: '3d',
        size: { width: 2, height: 3, depthOrArrayLayers: 4 },
      }),
    );
    expect(device.queue.writeTexture).toHaveBeenCalledOnce();
    expect(device.queue.writeTexture).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { bytesPerRow: 2 * 2, rowsPerImage: 3 },
      expect.anything(),
    );
    expect(volume.placement.dims).toEqual([2, 3, 4]);
    expect(volume.placement.frameKind).toBe('equatorial-cartesian');
  });
});
