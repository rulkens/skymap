/**
 * wireGalaxyCatalogSourceSlot — per-source galaxy-catalog asset slot
 * CONSTRUCTION, not demand. WHEN each asset loads belongs to the
 * `ASSET_WIRING` demand table, where the point sources appear as
 * `built: 'external'` rows built from `GALAXY_CATALOG_SOURCE_ROWS`.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { GalaxyCatalogRowEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogRowEntry';
import type { WirePointSourceDeps } from '../../../@types/engine/wiring/WirePointSourceDeps';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { createAssetSlot } from '../../loading/AssetSlot';
import { galaxyCatalogFetcher } from '../../loading/fetchers/galaxyCatalogFetcher';
import { syntheticPointFetcher } from '../../loading/fetchers/syntheticPointFetcher';
import { syncVisibilityFadeItem } from './syncVisibilityFades';
import { dispatchCatalogLoaded } from './dispatchCatalogLoaded';
import {
  engineSourceCountReported,
  engineProvenanceCountsReported,
} from '../../../state/engine/engineSlice';
import { countEstimatedProvenance } from '../../../utils/countEstimatedProvenance';

/**
 * Must run before `createSyntheticFallback`, `installLoadProgress` and
 * `reevaluateDemand`, which subscribe to and enumerate the minted slots. Renderer
 * construction order does NOT matter — `commit` re-reads the renderer at call time.
 * Not safe to call twice for the same source.
 */
export function wireGalaxyCatalogSourceSlot(
  state: EngineState,
  entry: GalaxyCatalogRowEntry,
  deps: WirePointSourceDeps,
): void {
  const source = entry.code;
  const id = entry.id;
  const { category } = entry;
  const { cb } = deps;
  const fetcher = category === 'synthetic' ? syntheticPointFetcher : galaxyCatalogFetcher;
  const slotName = `${id}-points`;

  const slot = createAssetSlot<GalaxyCatalog, GalaxyCatalogReq>({
    name: slotName,
    fetch: fetcher,
    commit: async (cloud) => {
      // Null mid-bootstrap or after teardown: drop the upload silently, the slot
      // still transitions to `ready`. Checked directly rather than through
      // `isEngineReady`, which also waits on handles populated LATER in bootstrap
      // and would reject this upload during the legitimate wireSlots window.
      if (state.gpu.galaxyPointRenderer === null) return;

      const t0 = performance.now();
      console.log(`[engine] upload start ${id} count=${cloud.count}`);
      // GalaxyPointRenderer keys its catalogs by the string id, not the source code.
      await state.gpu.galaxyPointRenderer.upload(id, cloud);
      state.data.galaxies.setCatalog(source, cloud);
      // One bump per catalog commit — the sky-cubemap re-bake key's content term.
      state.contentVersion += 1;

      // Lets the selection reconciler and the tier-reanchor saga re-resolve refs
      // whose cloud just landed.
      dispatchCatalogLoaded(cb.store, source);

      // The single-ITEM entry, not the batch bridge: on a tier swap every visible
      // source reloads concurrently, and a sweep would have this commit re-drive
      // the others' in-flight fades. Fire-and-forget, so the slot reaches `ready`
      // without waiting on the smoothstep.
      syncVisibilityFadeItem(state, 'survey', id);

      const dtMs = Math.round(performance.now() - t0);
      // If this disagrees with `cloud.count`, a concurrent upload overwrote.
      const onGpu = Array.from(state.gpu.galaxyPointRenderer.loadedSources())
        .map((e) => `${galaxyCatalogIdOf(e.source)}=${e.count}`)
        .join(', ');
      const total = state.gpu.galaxyPointRenderer.totalCount();
      console.log(
        `[engine] upload done  ${id} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
  });

  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      cb.store.dispatch(engineSourceCountReported({ source, count: s.value.count }));
      // One O(rows) pass paid here per commit rather than lazily in React, so the
      // debug panel never reaches into the raw cloud.
      cb.store.dispatch(
        engineProvenanceCountsReported({ source, counts: countEstimatedProvenance(s.value) }),
      );
    }
  });

  state.assetSlots.points.set(source, slot);
}
