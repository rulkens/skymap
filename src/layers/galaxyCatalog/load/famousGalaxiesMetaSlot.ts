/**
 * The famous-galaxy meta sidecar. No `commit`: the payload is pure metadata, so
 * the subscriber publishes it — to the runtime's own cell and, as a copy, to the
 * Layer's `famousMeta` fact. The fetcher throws on HTTP failure; `error`
 * publishes `[]`, degrading the enriched InfoCard text, not the engine.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { famousGalaxiesMetaFetcher } from './famousGalaxiesMetaFetcher';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { FamousGalaxiesPayload } from '../../../@types/loading/FamousGalaxiesPayload';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { GalaxyCatalogFacts } from '../@types/GalaxyCatalogFacts';

export function createFamousGalaxiesMetaSlot(
  deps: Pick<LayerCoreDeps<GalaxyCatalogFacts>, 'publish'>,
  setFamousMeta: (meta: readonly FamousGalaxyMetaEntry[]) => void,
): AssetSlot<FamousGalaxiesPayload, GalaxyCatalogReq> {
  const slot = createAssetSlot<FamousGalaxiesPayload, GalaxyCatalogReq>({
    name: 'famous-galaxies-meta',
    fetch: famousGalaxiesMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      setFamousMeta(s.value.meta);
      // A copy: immer freezes what the reducer stores, and a shared reference
      // would freeze the runtime's array too.
      deps.publish({ famousMeta: [...s.value.meta] });
    }
    if (s.kind === 'error') {
      setFamousMeta([]);
      deps.publish({ famousMeta: [] });
      console.warn('[engine] famous sidecar failed to load:', s.error);
    }
  });
  return slot;
}
