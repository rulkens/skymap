/**
 * wireGalaxyCatalogSourceSlot — one per-source galaxy-catalog slot, built by
 * `create`. WHEN it loads belongs to the Layer's asset rows, and the arrival
 * fade to core's `installFadeOnArrival`, not here. `subscribe` keeps today's two
 * writes at today's beat: core's catalog-landed pulse (which owns what the count
 * MEANS — Ruling 3) and the provenance fact.
 */

import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogRegistryEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogRegistryEntry';
import type { SourceType } from '../../../@types/data/SourceType';
import type { ProvenanceCounts } from '../../../@types/engine/ProvenanceCounts';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { GalaxyPointRenderer } from '../../../@types/rendering/GalaxyPointRenderer';
import type { GalaxyCatalogFacts } from '../@types/GalaxyCatalogFacts';

import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { countEstimatedProvenance } from '../../../utils/countEstimatedProvenance';
import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { galaxyCatalogFetcher } from './galaxyCatalogFetcher';

export function wireGalaxyCatalogSourceSlot(
  entry: GalaxyCatalogRegistryEntry,
  deps: LayerCoreDeps<GalaxyCatalogFacts>,
  galaxy: {
    readonly pointRenderer: GalaxyPointRenderer;
    readonly catalogs: Map<SourceType, GalaxyCatalog>;
    readonly provenanceCounts: Map<SourceType, ProvenanceCounts>;
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
      // GalaxyPointRenderer keys its catalogs by the string id, not the source code.
      await galaxy.pointRenderer.upload(id, cloud);
      galaxy.catalogs.set(source, cloud);
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
  });

  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      deps.reportSourceCount(source, s.value.count);
      // One O(rows) pass paid here per commit rather than lazily in React, so the
      // debug panel never reaches into the raw cloud.
      galaxy.provenanceCounts.set(source, countEstimatedProvenance(s.value));
      // A COPY of the whole tally: immer freezes what the reducer stores, and a
      // shared reference would freeze the runtime's own map on the next write.
      const published: Partial<Record<SourceType, ProvenanceCounts>> = {};
      for (const [code, counts] of galaxy.provenanceCounts) published[code] = counts;
      deps.publish({ provenanceCounts: published });
    }
  });

  return slot;
}
