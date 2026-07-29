/**
 * famousStarsMetaSlot — factory for the famous-star meta sidecar.
 *
 * Carries `famous_stars_meta.json` through the standard asset-slot machinery,
 * the star twin of `famousMetaSlot`. The two curated sources — the famous
 * galaxies and the famous stars — now load their sidecars by the same path,
 * so neither has a bespoke fetch to reason about.
 *
 * No `commit` step: there's nothing GPU-side to upload — the payload is pure
 * metadata consumed by the InfoCard via `state.data.bodies.famousStarsMeta`.
 * The subscriber writes the field; the render wake is `installSlotReadyWake`'s
 * job, not the factory's.
 *
 * **Graceful degradation on error.** The fetcher throws on HTTP failure (so
 * the retry policy distinguishes "really gone" from "transient flake"), and
 * this subscriber maps `kind: 'error'` → "feature off" by writing an empty
 * array. Net effect: the stars render without enriched InfoCard text, and the
 * engine keeps running.
 */

import { createAssetSlot } from '../AssetSlot';
import { famousStarsMetaFetcher } from '../fetchers/famousStarsMetaFetcher';
import type { FamousStarsPayload } from '../../../@types/loading/FamousStarsPayload';
import type { CompanionAssetReq } from '../../../@types/loading/CompanionAssetReq';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFamousStarsMetaSlot: SlotFactory<FamousStarsPayload, CompanionAssetReq> = (
  state,
  _cb,
) => {
  const slot = createAssetSlot({
    name: 'famous-stars-meta',
    fetch: famousStarsMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      state.data.bodies.setFamousStarsMeta(s.value.meta);
    }
    if (s.kind === 'error') {
      // Defensive — the field defaults to `[]` already, but writing it again
      // here is explicit about the contract: missing sidecar disables enriched
      // InfoCard text but keeps the engine functional.
      state.data.bodies.setFamousStarsMeta([]);
      console.warn('[engine] famous-stars sidecar failed to load:', s.error);
    }
  });
  return slot;
};
