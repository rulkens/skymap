/**
 * Unit test for starCatalogFetcher: resolves the requested (source, tier)
 * to the right `<binBaseName>-<tier>.bin` filename and inflates the response
 * into a StarCatalog. We stub fetchWithProgress to avoid a real network call
 * and feed it a synthetic in-memory bin — the round-trip proves the fetcher
 * awaits the async (inflating) decode rather than handing back raw bytes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/services/loading/fetchWithProgress', () => ({
  dataUrl: (path: string) => `/data/${path}`,
  fetchWithProgress: vi.fn(),
}));

import { starCatalogFetcher } from '../../../../src/services/loading/fetchers/starCatalogFetcher';
import {
  encodeStarCatalog,
  packStarRecord,
} from '../../../../src/data/starCatalog/starCatalogFormat';
import { fetchWithProgress } from '../../../../src/services/loading/fetchWithProgress';
import { Source } from '../../../../src/data/sources';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';

/**
 * A tiny hand-authored catalog — one aggregate over two leaves — kept
 * deliberately small: the fetcher's contract is "await the decode", not
 * "parse a large tree", so a couple of records is enough to prove the
 * round-trip survives the fetch → decode hop.
 */
function synthCatalog(): StarCatalog {
  const records = new Uint8Array([
    ...packStarRecord([12, 340, 7], 63, 31),
    ...packStarRecord([1023, 0, 512], 100, 5),
    ...packStarRecord([500, 500, 500], 70, 33),
  ]);

  return {
    starCount: 2,
    nodeCount: 3,
    mortonBitsPerAxis: 9,
    cellEdgePc: 3.75,
    gridOrigin: [-123.456789012345, 987.654321098765, -0.000012345678901],
    nodes: [
      { mortonIndex: 0, level: 1, childMask: 0x123456, firstRecord: 2, recordCount: 1 },
      { mortonIndex: 17, level: 0, childMask: 0, firstRecord: 0, recordCount: 1 },
      { mortonIndex: 4096, level: 0, childMask: 0, firstRecord: 1, recordCount: 1 },
    ],
    records,
  };
}

describe('starCatalogFetcher', () => {
  beforeEach(() => vi.mocked(fetchWithProgress).mockReset());

  it('fetches <binBaseName>-<tier>.bin and decodes it', async () => {
    const cat = synthCatalog();
    vi.mocked(fetchWithProgress).mockResolvedValueOnce(await encodeStarCatalog(cat));

    const decoded = await starCatalogFetcher(
      { source: Source.GaiaStars, tier: 'medium' },
      new AbortController().signal,
      () => {},
    );

    // Requested URL names the medium-tier Gaia star bin (binBaseName 'stars').
    expect(fetchWithProgress).toHaveBeenCalledOnce();
    const url = vi.mocked(fetchWithProgress).mock.calls[0]![0];
    expect(url).toContain('stars-medium.bin');

    // The catalog round-trips through the fetch → async-decode hop.
    expect(decoded.starCount).toBe(cat.starCount);
    expect(decoded.nodeCount).toBe(cat.nodeCount);
    // A spot-checked node survives field-for-field.
    expect(decoded.nodes[0]).toEqual(cat.nodes[0]);
    expect(Array.from(decoded.records)).toEqual(Array.from(cat.records));
  });

  it('throws when the requested source is not a star catalog', async () => {
    await expect(
      starCatalogFetcher(
        { source: Source.SDSS, tier: 'medium' },
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow();
    expect(fetchWithProgress).not.toHaveBeenCalled();
  });
});
