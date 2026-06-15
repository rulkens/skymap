import { describe, expect, it } from 'vitest';
import { filamentFetcher } from '../../../../src/services/loading/fetchers/filamentFetcher';
import { encodeFilaments } from '../../../../src/data/filament/filamentBinaryFormat';
import { useFetchMock } from '../../../setup/fetchMock';

const fetch = useFetchMock();

const emptyFilamentBuffer = (): ArrayBuffer => {
  // Smallest valid encoding: zero strips, zero vertices.  encodeFilaments
  // is the canonical writer — using it (rather than hand-crafting bytes)
  // means the fixture stays in sync if the format header ever changes.
  //
  // Note the FilamentCloud SoA shape: stripOffsets has length
  // stripCount + 1, so an empty cloud still needs a 1-element offset
  // table (the exclusive-scan sentinel).  Both encoder length-mismatch
  // guards are satisfied by these values.
  return encodeFilaments({
    stripCount: 0,
    vertexCount: 0,
    stripOffsets: new Uint32Array([0]),
    vertices: new Float32Array(0),
  });
};

describe('filamentFetcher (URL routing)', () => {
  it('uses filaments-small.bin for small tier', async () => {
    fetch.mock.mockResolvedValue(new Response(emptyFilamentBuffer(), { status: 200 }));
    await filamentFetcher({ tier: 'small' }, new AbortController().signal, () => {});
    expect(fetch.mock.mock.calls[0]?.[0]).toContain('filaments-small.bin');
  });

  it('uses filaments.bin for medium and large', async () => {
    for (const tier of ['medium', 'large'] as const) {
      fetch.mock.mockReset();
      fetch.mock.mockResolvedValue(new Response(emptyFilamentBuffer(), { status: 200 }));
      await filamentFetcher({ tier }, new AbortController().signal, () => {});
      expect(fetch.mock.mock.calls[0]?.[0]).toMatch(/\/filaments\.bin$/);
    }
  });
});

describe('filamentFetcher (success path)', () => {
  it('decodes the response body into a FilamentCloud', async () => {
    fetch.mock.mockResolvedValue(new Response(emptyFilamentBuffer(), { status: 200 }));
    const cloud = await filamentFetcher({ tier: 'small' }, new AbortController().signal, () => {});
    // An empty-cloud round-trip survives encode→fetch→decode.  Specific
    // shape (vertex array layout) is tested in filamentBinaryFormat
    // round-trip tests — here we only need to know the decoder ran
    // successfully and produced the SoA fields the renderer expects.
    expect(cloud).toBeDefined();
    expect(cloud.stripCount).toBe(0);
    expect(cloud.vertexCount).toBe(0);
    expect(cloud.stripOffsets).toBeInstanceOf(Uint32Array);
    expect(cloud.vertices).toBeInstanceOf(Float32Array);
  });
});

describe('filamentFetcher (error path)', () => {
  it('propagates a non-2xx HTTP status', async () => {
    fetch.mock.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(
      filamentFetcher({ tier: 'small' }, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });
});
