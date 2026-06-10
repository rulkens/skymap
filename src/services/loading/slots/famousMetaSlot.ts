/**
 * famousMetaSlot — factory for the famous-galaxy meta sidecar.
 *
 * Carries `famous_meta.json` through the standard asset-slot machinery.
 *
 * No `commit` step: there's nothing GPU-side to upload — the payload is
 * pure metadata consumed by the InfoCard via `galaxyStore.famousMeta`.
 * The subscriber writes the field; the render wake is `installSlotReadyWake`'s
 * job, not the factory's.
 *
 * **Graceful degradation on error.**  The fetcher throws on HTTP failure
 * (so the retry policy distinguishes "really gone" from "transient flake"),
 * and the slot subscriber maps `kind: 'error'` → "feature off" by writing
 * an empty array. Net effect for the user: famous galaxies render without
 * enriched InfoCard text, but the engine keeps running.
 */

import { createAssetSlot } from '../AssetSlot';
import { famousMetaFetcher } from '../fetchers/famousMetaFetcher';
import type { FamousPayload } from '../../../@types/loading/FamousPayload';
import type { CompanionAssetReq } from '../../../@types/loading/CompanionAssetReq';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFamousMetaSlot: SlotFactory<FamousPayload, CompanionAssetReq> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'famous-meta',
    fetch: famousMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      state.data.galaxies.setFamousMeta(s.value.meta);
    }
    if (s.kind === 'error') {
      // Defensive — the field defaults to `[]` already, but writing it
      // again here is explicit about the contract: missing sidecar
      // disables enriched InfoCard text but keeps the engine functional.
      state.data.galaxies.setFamousMeta([]);
      console.warn('[engine] famous sidecar failed to load:', s.error);
    }
  });
  return slot;
};
