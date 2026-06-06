/**
 * cf4DensityFetcher tests — happy path, 404, and malformed-header
 * paths against a mocked global fetch (via the shared useFetchMock
 * helper from tests/setup/fetchMock.ts).
 */
import { describe, expect, it } from 'vitest';
import { cf4DensityFetcher } from '../../../../src/services/loading/fetchers/cf4DensityFetcher';
import { encodeScalarField } from '../../../../src/data/scalarFieldFormat';
import { SG_TO_EQ_QUATERNION } from '../../../../src/data/superGalacticTransform';
import type { ScalarCube } from '../../../../src/@types/data/ScalarCube';
import { useFetchMock } from '../../../setup/fetchMock';

const fetch = useFetchMock();

function makeTinyCube(): ScalarCube {
  return {
    dims: [2, 2, 2],
    channels: 1,
    voxels: new Uint16Array([0, 0x3c00, 0x4000, 0x4200, 0x4400, 0x4500, 0x4600, 0x4700]),
    frameKind: 'supergalactic-cartesian',
    origin: [-1, -1, -1],
    voxelSize: 1,
    rotation: [
      SG_TO_EQ_QUATERNION[0]!,
      SG_TO_EQ_QUATERNION[1]!,
      SG_TO_EQ_QUATERNION[2]!,
      SG_TO_EQ_QUATERNION[3]!,
    ],
    valueMin: 0,
    valueMax: 7,
  };
}

describe('cf4DensityFetcher (success path)', () => {
  it('fetches and decodes a SCFD into a ScalarCube', async () => {
    // The fetcher's contract is: HTTP GET + decodeScalarField — the
    // returned cube should round-trip the data-side fields (dims,
    // frame, voxelSize).  Palette is no longer the fetcher's concern;
    // see `src/data/volumeFieldDefaults.ts`.
    const buf = encodeScalarField(makeTinyCube());
    fetch.mock.mockResolvedValue(new Response(buf, { status: 200 }));
    const cube = await cf4DensityFetcher(
      undefined,
      new AbortController().signal,
      () => {},
    );
    expect(cube.dims).toEqual([2, 2, 2]);
    expect(cube.frameKind).toBe('supergalactic-cartesian');
    expect(cube.voxelSize).toBe(1);
  });

  it('requests cf4_density.scfd', async () => {
    const buf = encodeScalarField(makeTinyCube());
    fetch.mock.mockResolvedValue(new Response(buf, { status: 200 }));
    await cf4DensityFetcher(undefined, new AbortController().signal, () => {});
    expect(fetch.mock.mock.calls[0]?.[0]).toContain('cf4_density.scfd');
  });
});

describe('cf4DensityFetcher (error paths)', () => {
  it('propagates a 404 as a thrown error', async () => {
    fetch.mock.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(
      cf4DensityFetcher(undefined, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it('throws on a body with bad SCFD magic', async () => {
    const garbage = new ArrayBuffer(96);
    new DataView(garbage).setUint32(0, 0xdeadbeef, true);
    fetch.mock.mockResolvedValue(new Response(garbage, { status: 200 }));
    await expect(
      cf4DensityFetcher(undefined, new AbortController().signal, () => {}),
    ).rejects.toThrow(/magic|SCFD/i);
  });
});
