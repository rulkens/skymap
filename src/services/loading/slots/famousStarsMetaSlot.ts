/**
 * famousStarsMetaSlot — factory for the famous-star meta sidecar.
 *
 * Carries `famous_stars_meta.json` through the standard asset-slot machinery,
 * the star twin of `createFamousGalaxiesMetaSlot`. The two curated sources — the famous
 * galaxies and the famous stars — load their sidecars by the same path, so
 * neither has a bespoke fetch to reason about.
 *
 * No `commit` step: there's nothing GPU-side to upload — the payload is pure
 * metadata for the InfoCard. The subscriber reports it to the engine slice
 * (`engineFamousStarsMetaReported`), which is where the card's container reads
 * it from; the engine itself has no use for the array, so parking a second copy
 * on the body store would be mirror state with no reader. The render wake is
 * `installSlotReadyWake`'s job, not the factory's.
 *
 * **Graceful degradation on error.** The fetcher throws on HTTP failure (so
 * the retry policy distinguishes "really gone" from "transient flake"), and
 * this subscriber maps `kind: 'error'` → "feature off" by reporting an empty
 * array. Net effect: the stars render without enriched InfoCard text, and the
 * engine keeps running.
 */

import { createAssetSlot } from '../AssetSlot';
import { famousStarsMetaFetcher } from '../fetchers/famousStarsMetaFetcher';
import { engineFamousStarsMetaReported } from '../../../state/engine/engineSlice';
import type { FamousStarsPayload } from '../../../@types/loading/FamousStarsPayload';
import type { CompanionAssetReq } from '../../../@types/loading/CompanionAssetReq';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFamousStarsMetaSlot: SlotFactory<FamousStarsPayload, CompanionAssetReq> = (
  _state,
  cb,
) => {
  const slot = createAssetSlot({
    name: 'famous-stars-meta',
    fetch: famousStarsMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      cb.store.dispatch(engineFamousStarsMetaReported(s.value.meta));
    }
    if (s.kind === 'error') {
      // The slice already defaults to `[]`, but reporting it again here is
      // explicit about the contract: a missing sidecar disables enriched
      // InfoCard text and keeps the engine functional.
      cb.store.dispatch(engineFamousStarsMetaReported([]));
      console.warn('[engine] famous-stars sidecar failed to load:', s.error);
    }
  });
  return slot;
};
