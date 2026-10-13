/**
 * The star family's whole runtime — the four renderers, the survey/famous
 * slots, and the shared upsample handle, as plain fields every contribution
 * closes over. Non-null throughout: `create` builds each one before
 * returning, so no reader re-checks a handle.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { FamousStarsPayload } from './FamousStarsPayload';
import type { StarCatalogRenderer } from './StarCatalogRenderer';
import type { StarCatalogPickRenderer } from './StarCatalogPickRenderer';
import type { StarRenderer } from './StarRenderer';
import type { StarPointRenderer } from './StarPointRenderer';
import type { StarAggregateUpsample } from './StarAggregateUpsample';
import type { StarCatalogFacts } from './StarCatalogFacts';
import type { StarChunkStream } from './StarChunkStream';
import type { StarPoolHost } from './StarPoolHost';

export type StarCatalogRuntime = {
  /** One slot per survey source (today `EngineAssetSlots.starCatalogs`). */
  readonly catalogs: ReadonlyMap<SourceType, AssetSlot<StarOctree, StarCatalogReq>>;
  /** A source's chunk stream while its committed index names chunks; the slot's commit fills it and release clears it. */
  readonly chunkStreams: Map<SourceType, StarChunkStream>;
  readonly famousStarsMeta: AssetSlot<FamousStarsPayload, void>;
  readonly renderer: StarCatalogRenderer;
  readonly pickRenderer: StarCatalogPickRenderer;
  readonly starRenderer: StarRenderer; // spheres (starSpheresPass, fieldStarSpherePass)
  readonly starPointRenderer: StarPointRenderer; // starPointsPass
  readonly aggregateUpsample: StarAggregateUpsample;
  /** Read by `resizeStarPools` (via `frame.ts`) to re-install pools; the slots hold the same object. */
  readonly poolHost: StarPoolHost;
  readonly publish: (patch: Partial<StarCatalogFacts>) => void;
};
