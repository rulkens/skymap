/**
 * wireGalaxyOctreeSlot — one octree galaxy source's slot, built by `create` for a row that
 * ships an octree. Commit installs the index's chunk pool at the committed tier's slots (a
 * tier change reloads the slot in place and re-installs) and sets the source's record
 * source; release drops the stream, the GPU pool and that record source. The record source
 * is a stub until the octree one lands: it knows its count and stats and answers nothing.
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
import type { OctreeIndexHeader } from '../../../@types/octree/OctreeIndexHeader';
import type { OctreePoolHost } from '../../../@types/octree/OctreePoolHost';
import type { StatId } from '../../../@types/octree/StatId';
import type { GalaxyCatalogFacts } from '../@types/GalaxyCatalogFacts';
import type { GalaxyOctreePayload } from '../@types/GalaxyOctreePayload';
import type { GalaxyPooledPointRenderer } from '../@types/GalaxyPooledPointRenderer';

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { installOctreePool } from '../../../services/octree/installOctreePool';
import { octreeChunkPath } from '../../../utils/octree/octreeChunkPath';
import { galaxyColumnsOf } from '../../../utils/galaxy/galaxyColumnsOf';
import { galaxyOctreeFetcher } from './galaxyOctreeFetcher';

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
  const budgets = (entry as GalaxyCatalogSourceEntry).octree?.budgets;
  if (budgets === undefined) {
    throw new Error(`wireGalaxyOctreeSlot: ${entry.id} ships no octree`);
  }
  const { pooledPointRenderer: renderer, chunkStreams, records } = galaxy;
  // What this slot set, so a release never deletes the flat slot's record source.
  let installed: GalaxyRecordSource | null = null;

  const slot = createAssetSlot<GalaxyOctreePayload, GalaxyOctreeReq>({
    name: `${entry.id}-octree`,
    fetch: galaxyOctreeFetcher,
    commit: async ({ octree, header }) => {
      const record = stubRecordSource(source, octree.recordCount, header);
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
      installOctreePool(host, source, octree, budgets[slot.lastRequest()!.tier].slots, {
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

function stubRecordSource(
  source: GalaxyCatalogSourceType,
  recordCount: number,
  header: OctreeIndexHeader,
): GalaxyRecordSource {
  const stat = (id: StatId): number => {
    const v = header.stats[id];
    if (v === undefined) throw new Error(`galaxy octree index lacks the ${id} stat`);
    return v;
  };
  return {
    source,
    recordCount,
    stats: {
      medianAbsMag: stat('medianAbsMag'),
      magOffset: stat('magOffset'),
      provenance: {
        total: recordCount,
        estimated: { orientation: stat('orientationEstimated'), size: stat('diameterEstimated') },
      },
    },
    ordinalOfPick: () => null,
    pickOfOrdinal: () => null,
    forEachResidentBlock: () => {},
    hasDurableId: () => false,
    loadRow: () => null,
    resolveDurableId: () => null,
    resolvePosition: () => null,
  };
}
