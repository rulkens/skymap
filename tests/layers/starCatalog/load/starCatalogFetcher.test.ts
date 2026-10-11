/**
 * Unit test for starCatalogFetcher: the Gaia row's `format` picks the file —
 * `<binBaseName>-<tier>.bin` for SKST (inflated through the async codec), the
 * tier-less octree index for `octree`. fetchWithProgress is stubbed with
 * synthetic in-memory objects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/services/loading/fetchWithProgress', () => ({
  dataUrl: (path: string) => `/data/${path}`,
  fetchWithProgress: vi.fn(),
}));

const row = vi.hoisted(() => ({ format: 'skst' as 'skst' | 'octree' }));
vi.mock('../../../../src/layers/starCatalog/sources/gaia-stars', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('../../../../src/layers/starCatalog/sources/gaia-stars')>();
  return {
    GAIA_STARS_ENTRY: {
      ...mod.GAIA_STARS_ENTRY,
      get format() {
        return row.format;
      },
    },
  };
});

import { starCatalogFetcher } from '../../../../src/layers/starCatalog/load/starCatalogFetcher';
import {
  encodeSkstCatalog,
  packStarRecord,
} from '../../../../src/data/starCatalog/starCatalogFormat';
import { fetchWithProgress } from '../../../../src/services/loading/fetchWithProgress';
import { starOctreeFromSkst } from '../../../../src/utils/star/starOctreeFromSkst';
import { Source } from '../../../../src/data/sources';
import { encodeOctreeObject } from '../../../../tools/octree/encodeOctreeObject';
import { NO_CHUNK_REF, STAR_COLUMN_SCHEMA } from '../../../../src/data/octree/octreeFormat';
import type { SkstCatalog } from '../../../../src/@types/data/starCatalog/SkstCatalog';
import type { OctreeChunkRef } from '../../../../src/@types/octree/OctreeChunkRef';
import type { ColumnId } from '../../../../src/@types/octree/ColumnId';
import type { OctreeRawColumn } from '../../../../tools/@types/octree/OctreeRawColumn';

/**
 * A tiny hand-authored catalog — one aggregate over two leaves — kept
 * deliberately small: the fetcher's contract is "await the decode", not
 * "parse a large tree", so a couple of records is enough to prove the
 * round-trip survives the fetch → decode hop.
 */
function synthCatalog(): SkstCatalog {
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

/** A one-row index (the root, one own record) naming two chunks it does not carry. */
function synthIndex(chunks: readonly OctreeChunkRef[]): Uint8Array {
  const nodes = {
    count: 1,
    morton: new Uint32Array([0]),
    level: new Uint8Array([4]),
    childMask: new Uint8Array([0]),
    firstRecord: new Uint32Array([0]),
    ownCount: new Uint32Array([1]),
    blobCount: new Uint32Array([0]),
    chunkRef: new Uint32Array([NO_CHUNK_REF]),
  };
  return encodeOctreeObject(
    {
      kind: 'index',
      family: 'star',
      grid: { bits: 4, origin: [0, 0, 0], cellEdge: 10 },
      stratify: { thr: 0.16, mLim: 10, refUnit: 10 },
      chunkCapacity: 64,
      chunkNodeCap: 8,
      nodes: 1,
      records: 1,
      columns: STAR_COLUMN_SCHEMA,
      stats: { starCount: 1 },
      chunks,
    },
    nodes,
    STAR_COLUMN_SCHEMA,
    new Map<ColumnId, OctreeRawColumn>([
      ['offset', new Uint16Array(3)],
      ['absMag', new Uint8Array(1)],
      ['colourIndex', new Uint8Array(1)],
    ]),
  );
}

describe('starCatalogFetcher', () => {
  beforeEach(() => {
    vi.mocked(fetchWithProgress).mockReset();
    row.format = 'skst';
  });

  it("fetches the v2 index by base name, with no tier, when the row's format is octree", async () => {
    row.format = 'octree';
    const chunk = { level: 2, morton: 0, hash: 'abcd1234', bytes: 100, nodes: 1, records: 1 };
    const bytes = synthIndex([chunk, { ...chunk, morton: 1 }]);
    vi.mocked(fetchWithProgress).mockResolvedValueOnce(bytes.slice().buffer);

    const decoded = await starCatalogFetcher(
      { source: Source.GaiaStars, tier: 'large' },
      new AbortController().signal,
      () => {},
    );

    expect(vi.mocked(fetchWithProgress).mock.calls[0]![0]).toMatch(/star-catalog\/v2\/stars\.bin$/);
    expect(decoded.chunks.length).toBe(2);
  });

  it('fetches <binBaseName>-<tier>.bin and decodes it', async () => {
    const cat = synthCatalog();
    vi.mocked(fetchWithProgress).mockResolvedValueOnce(await encodeSkstCatalog(cat));

    const decoded = await starCatalogFetcher(
      { source: Source.GaiaStars, tier: 'medium' },
      new AbortController().signal,
      () => {},
    );

    // Requested URL names the medium-tier Gaia star bin (binBaseName 'stars').
    expect(fetchWithProgress).toHaveBeenCalledOnce();
    const url = vi.mocked(fetchWithProgress).mock.calls[0]![0];
    expect(url).toContain('stars-medium.bin');

    // The catalog round-trips through the fetch → async-decode → adapter hop.
    expect(decoded).toEqual(starOctreeFromSkst(cat));
    expect(decoded.chunks).toEqual([]);
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
