/**
 * wireGalaxyOctreeSlot — one octree galaxy source's slot, built by `create` for a row that
 * ships an octree. Commit installs the index's chunk pool at the committed tier's records (a
 * tier change reloads the slot in place and re-installs) and sets the source's record
 * source; release drops the stream, the GPU pool and that record source.
 */

import type { GalaxyCatalogRegistryEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogRegistryEntry';
import type { GalaxyCatalogSourceEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyRecordSource } from '../../../@types/data/galaxyCatalog/GalaxyRecordSource';
import type { SourceType } from '../../../@types/data/SourceType';
import type { ProvenanceCounts } from '../../../@types/engine/ProvenanceCounts';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { GalaxyOctreeReq } from '../../../@types/loading/GalaxyOctreeReq';
import type { OctreeChunkStream } from '../../../@types/octree/OctreeChunkStream';
import type { OctreePoolHost } from '../../../@types/octree/OctreePoolHost';
import type { GalaxyCatalogFacts } from '../@types/GalaxyCatalogFacts';
import type { GalaxyOctreePayload } from '../@types/GalaxyOctreePayload';
import type { GalaxyPooledPointRenderer } from '../@types/GalaxyPooledPointRenderer';

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { installOctreePool } from '../../../services/octree/installOctreePool';
import { octreeChunkPath } from '../../../utils/octree/octreeChunkPath';
import { octreePoolShape } from '../../../utils/octree/octreePoolShape';
import { galaxyColumnsOf } from '../../../utils/galaxy/galaxyColumnsOf';
import { octreeResidency } from '../../../services/octree/octreeResidency';
import { fetchDataBytes } from '../../../services/loading/fetchDataBytes';
import { galaxyOctreeFetcher } from './galaxyOctreeFetcher';
import { octreeGalaxyRecordSource } from './octreeGalaxyRecordSource';

export function wireGalaxyOctreeSlot(
  entry: GalaxyCatalogRegistryEntry,
  deps: Pick<LayerCoreDeps<GalaxyCatalogFacts>, 'publish' | 'requestRender'>,
  galaxy: {
    readonly pooledPointRenderer: GalaxyPooledPointRenderer;
    readonly chunkStreams: Map<SourceType, OctreeChunkStream<GalaxyColumns>>;
    readonly records: Map<GalaxyCatalogSourceType, GalaxyRecordSource>;
    readonly bumpCatalogsVersion: () => void;
  },
): AssetSlot<GalaxyOctreePayload, GalaxyOctreeReq> {
  const source = entry.code;
  const { binBaseName } = entry;
  const octreeEntry = (entry as GalaxyCatalogSourceEntry).octree;
  if (octreeEntry === undefined) {
    throw new Error(`wireGalaxyOctreeSlot: ${entry.id} ships no octree`);
  }
  const { pooledPointRenderer: renderer, chunkStreams, records } = galaxy;
  // What this slot set, so a release never deletes the flat slot's record source.
  let installed: GalaxyRecordSource | null = null;

  const slot = createAssetSlot<GalaxyOctreePayload, GalaxyOctreeReq>({
    name: `${entry.id}-octree`,
    fetch: galaxyOctreeFetcher,
    commit: async (payload) => {
      const { octree } = payload;
      const record = octreeGalaxyRecordSource(entry, payload, {
        renderer,
        residency: octreeResidency(chunkStreams, source),
        fetchBytes: fetchDataBytes,
      });
      // The pack reads the catalog stats, which `OctreePoolHost`'s upload does not carry.
      const host: OctreePoolHost<GalaxyColumns> = {
        renderer: {
          upload: (s, o, n) => renderer.upload(s, o, n, record.stats),
          uploadChunk: renderer.uploadChunk,
          evictChunk: renderer.evictChunk,
        },
        chunkStreams,
        requestRender: deps.requestRender,
      };
      // The slot's race-check ran just before this call, so `lastRequest()` is this commit's.
      const { budgets, poolNodesPerRecord } = octreeEntry;
      const tier = slot.lastRequest()!.tier;
      const pool = octreePoolShape(octree, budgets[tier].poolRecords, poolNodesPerRecord);
      installOctreePool(host, source, octree, pool, {
        chunkPath: (ref) => octreeChunkPath('galaxy', binBaseName, ref),
        decodeRecords: galaxyColumnsOf,
      });
      records.set(source, record);
      installed = record;
      galaxy.bumpCatalogsVersion();
    },
    onRelease: () => {
      chunkStreams.get(source)?.destroy();
      chunkStreams.delete(source);
      renderer.unload(source);
      if (installed !== null && records.get(source) === installed) records.delete(source);
      installed = null;
      galaxy.bumpCatalogsVersion();
    },
  });

  slot.subscribe((s) => {
    if (s.kind !== 'ready' && s.kind !== 'idle') return;
    const published: Partial<Record<SourceType, ProvenanceCounts>> = {};
    for (const [code, record] of records) published[code] = record.stats.provenance;
    deps.publish({ provenanceCounts: published });
  });

  return slot;
}
