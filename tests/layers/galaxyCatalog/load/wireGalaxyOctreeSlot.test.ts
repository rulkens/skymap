/**
 * wireGalaxyOctreeSlot — the octree source's slot: its commit installs the chunk pool at
 * the requested tier's slots and sets the source's record source; its release takes the
 * stream, the GPU pool and that record source away again.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/layers/galaxyCatalog/load/galaxyOctreeFetcher', () => ({
  galaxyOctreeFetcher: vi.fn(),
}));

import { wireGalaxyOctreeSlot } from '../../../../src/layers/galaxyCatalog/load/wireGalaxyOctreeSlot';
import { galaxyOctreeFetcher } from '../../../../src/layers/galaxyCatalog/load/galaxyOctreeFetcher';
import { GALAXY_COLUMN_SCHEMA } from '../../../../src/data/octree/galaxyOctreeFamily';
import { NO_CHUNK_REF } from '../../../../src/data/octree/octreeFormat';
import { Source, SOURCE_REGISTRY } from '../../../../src/data/sources';
import { octreePoolShape } from '../../../../src/utils/octree/octreePoolShape';
import type { GalaxyColumns } from '../../../../src/@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyCatalogSourceType } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyRecordSource } from '../../../../src/@types/data/galaxyCatalog/GalaxyRecordSource';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { OctreeChunkStream } from '../../../../src/@types/octree/OctreeChunkStream';
import type { OctreeIndexHeader } from '../../../../src/@types/octree/OctreeIndexHeader';
import type { Octree } from '../../../../src/@types/octree/Octree';
import type { GalaxyPooledPointRenderer } from '../../../../src/layers/galaxyCatalog/@types/GalaxyPooledPointRenderer';
import type { GalaxyOctreePayload } from '../../../../src/layers/galaxyCatalog/@types/GalaxyOctreePayload';

const OCTREE = {
  family: 'galaxy',
  grid: { bits: 4, origin: [0, 0, 0], cellEdge: 1 },
  recordCount: 40,
  columns: GALAXY_COLUMN_SCHEMA,
  nodes: {
    count: 1,
    morton: Uint32Array.of(0),
    level: Uint8Array.of(4),
    childMask: Uint8Array.of(1),
    firstRecord: Uint32Array.of(0),
    ownCount: Uint32Array.of(0),
    blobCount: Uint32Array.of(40),
    chunkRef: Uint32Array.of(NO_CHUNK_REF),
  },
  records: { count: 1 },
  chunks: [],
  chunkCount: 100,
  chunkCapacity: 8,
  chunkNodeCap: 4,
} as unknown as Octree<GalaxyColumns>;
const HEADER = {
  stats: {
    recordCount: 40,
    medianAbsMag: -20,
    magOffset: 0.3,
    orientationEstimated: 5,
    diameterEstimated: 6,
  },
  chunkDirectory: [],
  namedPgcs: [],
  pgcShards: [],
} as unknown as OctreeIndexHeader;

describe('wireGalaxyOctreeSlot', () => {
  it('the octree slot installs the pool at the tier slots and releases it', async () => {
    vi.mocked(galaxyOctreeFetcher).mockResolvedValue({
      octree: OCTREE,
      header: HEADER,
      info: new Map(),
    } satisfies GalaxyOctreePayload);
    const renderer = {
      upload: vi.fn(),
      unload: vi.fn(),
      uploadChunk: vi.fn(),
      evictChunk: vi.fn(),
    };
    const chunkStreams = new Map<SourceType, OctreeChunkStream<GalaxyColumns>>();
    const records = new Map<GalaxyCatalogSourceType, GalaxyRecordSource>();
    const slot = wireGalaxyOctreeSlot(
      SOURCE_REGISTRY[Source.Glade],
      { publish: vi.fn(), requestRender: vi.fn() },
      {
        pooledPointRenderer: renderer as unknown as GalaxyPooledPointRenderer,
        chunkStreams,
        records,
        bumpCatalogsVersion: vi.fn(),
      },
    );

    await slot.load({ source: Source.Glade, tier: 'medium' });
    const { budgets, poolNodesPerRecord } = SOURCE_REGISTRY[Source.Glade].octree;
    const pool = octreePoolShape(OCTREE, budgets.medium.poolRecords, poolNodesPerRecord);
    expect(renderer.upload).toHaveBeenCalledWith(Source.Glade, OCTREE, pool, {
      medianAbsMag: -20,
      magOffset: 0.3,
      provenance: { total: 40, estimated: { orientation: 5, size: 6 } },
    });
    expect(chunkStreams.get(Source.Glade)?.capacity.slots).toBe(pool.slots);
    expect(records.get(Source.Glade)?.recordCount).toBe(40);

    slot.release();
    expect(renderer.unload).toHaveBeenCalledWith(Source.Glade);
    expect(chunkStreams.has(Source.Glade)).toBe(false);
    expect(records.has(Source.Glade)).toBe(false);
  });
});
