/**
 * wireGalaxyCatalogSourceSlot — one per-source galaxy-catalog slot, built by
 * `create`. WHEN it loads belongs to the Layer's asset rows, and the arrival
 * fade to core (the row's `gates`), not here. `subscribe` keeps the
 * provenance fact at today's beat; the catalog-landed pulse rides the Layer's
 * `sourceCounts` feed, which subscribes to this same slot.
 */

import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogRegistryEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogRegistryEntry';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyRecordSource } from '../../../@types/data/galaxyCatalog/GalaxyRecordSource';
import type { SourceType } from '../../../@types/data/SourceType';
import type { ProvenanceCounts } from '../../../@types/engine/ProvenanceCounts';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { GalaxyPointRenderer } from '../../../@types/rendering/GalaxyPointRenderer';
import type { GalaxyCatalogFacts } from '../@types/GalaxyCatalogFacts';

import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { galaxyCatalogFetcher } from './galaxyCatalogFetcher';
import { flatGalaxyRecordSource } from './flatGalaxyRecordSource';

export function wireGalaxyCatalogSourceSlot(
  entry: GalaxyCatalogRegistryEntry,
  deps: LayerCoreDeps<GalaxyCatalogFacts>,
  galaxy: {
    readonly pointRenderer: GalaxyPointRenderer;
    readonly catalogs: Map<SourceType, GalaxyCatalog>;
    readonly records: Map<GalaxyCatalogSourceType, GalaxyRecordSource>;
    readonly famousMeta: () => readonly FamousGalaxyMetaEntry[];
    readonly bumpCatalogsVersion: () => void;
  },
): AssetSlot<GalaxyCatalog, GalaxyCatalogReq> {
  const source = entry.code;
  const id = entry.id;

  const slot = createAssetSlot<GalaxyCatalog, GalaxyCatalogReq>({
    name: `${id}-points`,
    fetch: galaxyCatalogFetcher,
    commit: async (cloud) => {
      const t0 = performance.now();
      console.log(`[engine] upload start ${id} count=${cloud.count}`);
      // Built first: the bake reads the source's stats instead of recomputing them.
      const record = flatGalaxyRecordSource(entry, cloud, galaxy.famousMeta);
      // GalaxyPointRenderer keys its catalogs by the string id, not the source code.
      await galaxy.pointRenderer.upload(id, cloud, record.stats);
      galaxy.catalogs.set(source, cloud);
      galaxy.records.set(source, record);
      // Every commit replaces (or seeds) this source's array, so a built alias
      // index's row set goes stale (aliases for galaxies the new array lacks,
      // none for ones it gained) — bump so `frame` rebuilds it.
      galaxy.bumpCatalogsVersion();

      const dtMs = Math.round(performance.now() - t0);
      // If this disagrees with `cloud.count`, a concurrent upload overwrote.
      const onGpu = Array.from(galaxy.pointRenderer.loadedSources())
        .map((e) => `${galaxyCatalogIdOf(e.source)}=${e.count}`)
        .join(', ');
      const total = galaxy.pointRenderer.totalCount();
      console.log(
        `[engine] upload done  ${id} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
    // Search and picking read `records`, so a released
    // catalog must leave it with the GPU buffers or they would find galaxies
    // that are no longer drawn.
    onRelease: () => {
      galaxy.pointRenderer.unload(id);
      galaxy.catalogs.delete(source);
      galaxy.records.delete(source);
      galaxy.bumpCatalogsVersion();
    },
  });

  // `records` is current at both beats: commit sets it before `ready`, and
  // `onRelease` deletes it before the slot announces `idle`.
  slot.subscribe((s) => {
    if (s.kind !== 'ready' && s.kind !== 'idle') return;
    const published: Partial<Record<SourceType, ProvenanceCounts>> = {};
    for (const [code, record] of galaxy.records) published[code] = record.stats.provenance;
    deps.publish({ provenanceCounts: published });
  });

  return slot;
}
