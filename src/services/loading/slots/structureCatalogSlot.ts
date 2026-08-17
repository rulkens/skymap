/**
 * structureCatalogSlot — factory for the cluster/supercluster coverage layer.
 *
 * Carries the `{ catalog, meta }` payload (decoded `structures.ccat` + parsed
 * `structures_meta.json`) through the standard asset-slot machinery.
 *
 * No `commit` step: there is nothing to upload GPU-side here. The payload is
 * CPU-resident structure data — `wireStructureProjection` subscribes to this
 * same slot and converts the ready value into `StructureInfo`s, writing them
 * to `structureStore`. Mirrors `createFamousGalaxiesMetaSlot` in shape.
 *
 * This subscriber's only job is to warn on failure (the render wake is
 * `installSlotReadyWake`'s job). It owns no state — the data flows through
 * the slot's ready value.
 *
 * **Graceful degradation on error.** A failed fetch (404 / network) maps to
 * "feature off": the subscriber warns and `wireStructureProjection` clears the
 * bulk group. Net effect for the user — bulk clusters simply don't appear,
 * while the featured cluster anchors and the rest of the app keep working
 * unchanged.
 */

import { createAssetSlot } from '../AssetSlot';
import { structureCatalogFetcher } from '../fetchers/structureCatalogFetcher';
import type { StructureCatalogPayload } from '../../../@types/loading/StructureCatalogPayload';
import type { StructureCatalogReq } from '../../../@types/loading/StructureCatalogReq';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createStructureCatalogSlot: SlotFactory<
  StructureCatalogPayload,
  StructureCatalogReq
> = (_state, _cb) => {
  const slot = createAssetSlot({
    name: 'structure-catalog',
    fetch: structureCatalogFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'error') {
      console.warn('[engine] cluster catalog failed to load:', s.error);
    }
  });
  return slot;
};
