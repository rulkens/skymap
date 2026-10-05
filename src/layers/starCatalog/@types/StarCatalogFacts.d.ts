/**
 * What the Layer publishes into `state.engine.starCatalog` — the famous-star
 * InfoCard sidecar, mirroring `GalaxyCatalogFacts.famousMeta`.
 */

import type { FamousStarMetaEntry } from '../../../@types/loading/FamousStarMetaEntry';

export type StarCatalogFacts = { readonly famousStarsMeta: readonly FamousStarMetaEntry[] };
