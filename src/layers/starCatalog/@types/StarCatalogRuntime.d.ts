/**
 * The star family's whole runtime — the four renderers, the survey/famous
 * slots, and the shared upsample handle, as plain fields every contribution
 * closes over. Non-null throughout: `create` builds each one before
 * returning, so no reader re-checks a handle.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { FamousStarsPayload } from './FamousStarsPayload';
import type { StarCatalogRenderer } from './StarCatalogRenderer';
import type { StarCatalogPickRenderer } from './StarCatalogPickRenderer';
import type { StarRenderer } from './StarRenderer';
import type { StarPointRenderer } from './StarPointRenderer';
import type { StarAggregateUpsample } from './StarAggregateUpsample';
import type { StarCatalogFacts } from './StarCatalogFacts';

export type StarCatalogRuntime = {
  /** One slot per survey source (today `EngineAssetSlots.starCatalogs`). */
  readonly catalogs: ReadonlyMap<SourceType, AssetSlot<StarCatalog, StarCatalogReq>>;
  readonly famousStarsMeta: AssetSlot<FamousStarsPayload, void>;
  readonly renderer: StarCatalogRenderer; // was state.gpu.starCatalogRenderer
  readonly pickRenderer: StarCatalogPickRenderer; // was state.gpu.starCatalogPickRenderer
  readonly starRenderer: StarRenderer; // spheres (starSpheresPass, fieldStarSpherePass)
  readonly starPointRenderer: StarPointRenderer; // starPointsPass
  readonly aggregateUpsample: StarAggregateUpsample; // was state.gpu.starAggregateUpsample
  readonly publish: (patch: Partial<StarCatalogFacts>) => void;
};
