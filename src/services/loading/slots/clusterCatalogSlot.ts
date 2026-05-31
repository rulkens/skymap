/**
 * clusterCatalogSlot — factory for the cluster/supercluster coverage layer.
 *
 * Carries the `{ catalog, meta }` payload (decoded `clusters.ccat` + parsed
 * `clusters_meta.json`) through the standard asset-slot machinery.
 *
 * No `commit` step: there is nothing to upload GPU-side here. The payload is
 * CPU-resident POI data — a later task merges it into `poiSubsystem` so the
 * bulk structures render through the same marker/label path as the featured
 * anchors. Mirrors `famousMetaSlot` in shape.
 *
 * The subscriber writes the WHOLE payload (not just `.meta`) into
 * `state.sources.clusterBulk`, because the bulk POI builder needs both the
 * numeric `catalog` (positions, radii, category) and the string `meta`
 * (names, descriptions) keyed by the same localIdx.
 *
 * **Graceful degradation on error.** A failed fetch (404 / network) maps to
 * "feature off": the subscriber writes `null` and warns. Net effect for the
 * user — bulk clusters simply don't appear, while the featured cluster
 * anchors and the rest of the app keep working unchanged.
 */

import { createAssetSlot } from '../AssetSlot';
import { clusterCatalogFetcher } from '../fetchers/clusterCatalogFetcher';
import type { ClusterCatalogPayload } from '../../../@types/loading/ClusterCatalogPayload';
import type { ClusterCatalogReq } from '../../../@types/loading/ClusterCatalogReq';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createClusterCatalogSlot: SlotFactory<ClusterCatalogPayload, ClusterCatalogReq> = (
  state,
  _cb,
) => {
  const slot = createAssetSlot({
    name: 'cluster-catalog',
    fetch: clusterCatalogFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      state.sources.clusterBulk = s.value;
      state.subsystems.scheduler.requestRender();
    }
    if (s.kind === 'error') {
      state.sources.clusterBulk = null;
      console.warn('[engine] cluster catalog failed to load:', s.error);
    }
  });
  state.assetSlots.clusterCatalog = slot;
  return slot;
};
