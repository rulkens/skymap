import { gzipSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { fetchVolumeBrick } from '../../../../../src/layers/cosmicWebDensity/detailRegion/load/fetchVolumeBrick';
import { useFetchMock } from '../../../../setup/fetchMock';

const URL = 'https://example.test/mcpm.astc6.L0.p0.pack';
const BRICK = Uint8Array.from({ length: 64 }, (_, i) => i);
const MEMBER = new Uint8Array(gzipSync(BRICK, { level: 9 }));
const entry = (body: Uint8Array) => ({ offset: 0, length: body.byteLength });
const respond = (body: Uint8Array, status: number) =>
  Promise.resolve(new Response(body as Uint8Array<ArrayBuffer>, { status }));

describe('fetchVolumeBrick', () => {
  const fetch = useFetchMock();

  it("a 206 gzip member yields the brick's bytes", async () => {
    fetch.mock.mockImplementation(() => respond(MEMBER, 206));
    expect(await fetchVolumeBrick(URL, entry(MEMBER), BRICK.byteLength)).toEqual(BRICK);
  });

  it('a 200 reads no-range', async () => {
    fetch.mock.mockImplementation(() => respond(MEMBER, 200));
    expect(await fetchVolumeBrick(URL, entry(MEMBER), BRICK.byteLength)).toBe('no-range');
  });

  it('a wrong inflated length or a corrupt member fails', async () => {
    fetch.mock.mockImplementation(() => respond(MEMBER, 206));
    expect(await fetchVolumeBrick(URL, entry(MEMBER), BRICK.byteLength + 1)).toBeNull();
    const corrupt = MEMBER.slice();
    corrupt.fill(0xff, 10, 20);
    fetch.mock.mockImplementation(() => respond(corrupt, 206));
    expect(await fetchVolumeBrick(URL, entry(corrupt), BRICK.byteLength)).toBeNull();
  });
});
