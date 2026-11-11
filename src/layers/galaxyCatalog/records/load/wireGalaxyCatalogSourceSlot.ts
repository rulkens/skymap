/**
 * wireGalaxyCatalogSourceSlot — one per-source galaxy-catalog slot, built by
 * `create`. WHEN it loads belongs to the Layer's asset rows, and the arrival
 * fade to core (the row's `gates`), not here. `subscribe` keeps the
 * provenance fact; the catalog-landed pulse rides the Layer's `sourceCounts`
 * feed, which subscribes to this same slot.
 */

import type { GalaxyCatalog } from '../../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogRegistryEntry } from '../../@types/GalaxyCatalogRegistryEntry';
import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { GalaxyRecordSource } from '../@types/GalaxyRecordSource';
import type { ProvenanceCounts } from '../../../../@types/engine/ProvenanceCounts';
import type { LayerCoreDeps } from '../../../../@types/engine/layer/LayerCoreDeps';
import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { GalaxyCatalogReq } from '../../../../@types/loading/GalaxyCatalogReq';
import type { GalaxyPointRenderer } from '../../pointSprites/@types/GalaxyPointRenderer';
import type { GalaxyCatalogFacts } from '../../@types/GalaxyCatalogFacts';

import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { galaxyCatalogFetcher } from './galaxyCatalogFetcher';
import { flatGalaxyRecordSource } from './flatGalaxyRecordSource';

export function wireGalaxyCatalogSourceSlot(
  entry: GalaxyCatalogRegistryEntry,
  deps: LayerCoreDeps<GalaxyCatalogFacts>,
  galaxy: {
    readonly pointRenderer: GalaxyPointRenderer;
    readonly catalogs: Map<GalaxyCatalogId, GalaxyCatalog>;
    readonly records: Map<GalaxyCatalogId, GalaxyRecordSource>;
    readonly bumpCatalogsVersion: () => void;
  },
): AssetSlot<GalaxyCatalog, GalaxyCatalogReq> {
  const id = entry.id;

  const slot = createAssetSlot<GalaxyCatalog, GalaxyCatalogReq>({
    name: `${id}-points`,
    fetch: galaxyCatalogFetcher,
    commit: async (cloud) => {
      const t0 = performance.now();
      console.log(`[engine] upload start ${id} count=${cloud.count}`);
      // Built first: the bake reads the source's stats instead of recomputing them.
      const record = flatGalaxyRecordSource(entry, cloud);
      await galaxy.pointRenderer.upload(id, cloud, record.stats);
      galaxy.catalogs.set(id, cloud);
      galaxy.records.set(id, record);
      // A commit swaps this source's array, staling any built alias index.
      galaxy.bumpCatalogsVersion();

      const dtMs = Math.round(performance.now() - t0);
      // If this disagrees with `cloud.count`, a concurrent upload overwrote.
      const onGpu = Array.from(galaxy.pointRenderer.loadedSources())
        .map((e) => `${e.source}=${e.count}`)
        .join(', ');
      const total = galaxy.pointRenderer.totalCount();
      console.log(
        `[engine] upload done  ${id} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
    // `records` must leave with the GPU buffers or search and picking find
    // galaxies that are no longer drawn.
    onRelease: () => {
      galaxy.pointRenderer.unload(id);
      galaxy.catalogs.delete(id);
      galaxy.records.delete(id);
      galaxy.bumpCatalogsVersion();
    },
  });

  // `records` is current at both beats: commit sets it before `ready`, and
  // `onRelease` deletes it before the slot announces `idle`.
  slot.subscribe((s) => {
    if (s.kind !== 'ready' && s.kind !== 'idle') return;
    const published: Partial<Record<GalaxyCatalogId, ProvenanceCounts>> = {};
    for (const [id, record] of galaxy.records) published[id] = record.stats.provenance;
    deps.publish({ provenanceCounts: published });
  });

  return slot;
}
