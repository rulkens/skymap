/**
 * createFamousGalaxiesMetaSlot — factory for the famous-galaxy meta sidecar.
 *
 * Carries `famous_galaxies_meta.json` through the standard asset-slot machinery, the
 * galaxy twin of `famousStarsMetaSlot`. The two curated sources — the famous
 * galaxies and the famous stars — load their sidecars by the same path, so
 * neither has a bespoke fetch to reason about.
 *
 * No `commit` step: there's nothing GPU-side to upload — the payload is pure
 * metadata. The subscriber reports it to the engine slice
 * (`engineFamousGalaxiesMetaReported`), which is the one home for the
 * payload: the command palette reads it through `selectFamousGalaxiesMeta`,
 * and the engine reads it each frame through the `state.famousGalaxiesMeta`
 * getter (label production, textured and hi-res disk subsystems, the radius
 * ring). The InfoCard's
 * famous-galaxy text takes the engine-side route instead, via the
 * `selectionRows` slice. The render wake is `installSlotReadyWake`'s job, not
 * the factory's.
 *
 * **Graceful degradation on error.** The fetcher throws on HTTP failure (so
 * the retry policy distinguishes "really gone" from "transient flake"), and
 * this subscriber maps `kind: 'error'` → "feature off" by reporting an empty
 * array. Net effect: famous galaxies render without enriched InfoCard text,
 * and the engine keeps running.
 */

import { createAssetSlot } from '../AssetSlot';
import { famousGalaxiesMetaFetcher } from '../fetchers/famousGalaxiesMetaFetcher';
import { engineFamousGalaxiesMetaReported } from '../../../state/engine/engineSlice';
import type { FamousGalaxiesPayload } from '../../../@types/loading/FamousGalaxiesPayload';
import type { CompanionAssetReq } from '../../../@types/loading/CompanionAssetReq';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFamousGalaxiesMetaSlot: SlotFactory<FamousGalaxiesPayload, CompanionAssetReq> = (
  _state,
  cb,
) => {
  const slot = createAssetSlot({
    name: 'famous-galaxies-meta',
    fetch: famousGalaxiesMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      cb.store.dispatch(engineFamousGalaxiesMetaReported(s.value.meta));
    }
    if (s.kind === 'error') {
      // The slice already defaults to `[]`, but reporting it again here is
      // explicit about the contract: a missing sidecar disables enriched
      // InfoCard text and keeps the engine functional.
      cb.store.dispatch(engineFamousGalaxiesMetaReported([]));
      console.warn('[engine] famous sidecar failed to load:', s.error);
    }
  });
  return slot;
};
