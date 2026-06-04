/**
 * clusterCatalogSlot — factory for the cluster/supercluster coverage layer.
 *
 * Carries the `{ catalog, meta }` payload (decoded `clusters.ccat` + parsed
 * `clusters_meta.json`) through the standard asset-slot machinery.
 *
 * No `commit` step: there is nothing to upload GPU-side here. The payload is
 * CPU-resident structure data — `wireStructureProjection` subscribes to this
 * same slot and converts the ready value into `StructureRecord`s, writing them
 * to `structureStore`. Mirrors `famousMetaSlot` in shape.
 *
 * This subscriber's only job is to wake the renderer once the layer lands so
 * the freshly-added bulk markers get drawn, and to warn on failure. It does
 * not own any state — the data flows through the slot's ready value.
 *
 * **Graceful degradation on error.** A failed fetch (404 / network) maps to
 * "feature off": the subscriber warns and `wireStructureProjection` clears the
 * bulk group. Net effect for the user — bulk clusters simply don't appear,
 * while the featured cluster anchors and the rest of the app keep working
 * unchanged.
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
      state.subsystems.scheduler.requestRender();
    }
    if (s.kind === 'error') {
      console.warn('[engine] cluster catalog failed to load:', s.error);
    }
  });
  return slot;
};
