/**
 * createFamousGalaxiesMetaSlot — the famous-galaxy meta sidecar. No `commit`:
 * the payload is pure metadata, so the subscriber publishes it — to the galaxy
 * store (the engine-side home) and to the engine slice (the command palette's,
 * until PR-D). The fetcher throws on HTTP failure; `error` publishes `[]`, so a
 * missing sidecar degrades the enriched InfoCard text, not the engine.
 */

import { createAssetSlot } from '../AssetSlot';
import { famousGalaxiesMetaFetcher } from '../../../layers/galaxyCatalog/load/famousGalaxiesMetaFetcher';
import { engineFamousGalaxiesMetaReported } from '../../../state/engine/engineSlice';
import type { FamousGalaxiesPayload } from '../../../@types/loading/FamousGalaxiesPayload';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFamousGalaxiesMetaSlot: SlotFactory<FamousGalaxiesPayload, GalaxyCatalogReq> = (
  state,
  cb,
) => {
  const slot = createAssetSlot({
    name: 'famous-galaxies-meta',
    fetch: famousGalaxiesMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      state.data.galaxies.setFamousMeta(s.value.meta);
      cb.store.dispatch(engineFamousGalaxiesMetaReported(s.value.meta));
    }
    if (s.kind === 'error') {
      state.data.galaxies.setFamousMeta([]);
      cb.store.dispatch(engineFamousGalaxiesMetaReported([]));
      console.warn('[engine] famous sidecar failed to load:', s.error);
    }
  });
  return slot;
};
