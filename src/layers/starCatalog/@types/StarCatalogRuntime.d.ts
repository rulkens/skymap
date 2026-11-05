/**
 * The star family's whole runtime: renderers, survey/famous slots and the shared
 * upsample handle. Non-null throughout: `create` builds each before returning.
 */

import type { StarCatalogSourceType } from './StarCatalogSourceType';
import type { Octree } from '../../../@types/octree/Octree';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StarCatalogReq } from '../survey/@types/StarCatalogReq';
import type { FamousStarsPayload } from '../card/@types/FamousStarsPayload';
import type { StarCatalogRenderer } from '../survey/@types/StarCatalogRenderer';
import type { StarCatalogPickRenderer } from '../survey/@types/StarCatalogPickRenderer';
import type { StarRenderer } from '../resolvedStars/@types/StarRenderer';
import type { StarPointRenderer } from '../seededStars/@types/StarPointRenderer';
import type { StarAggregateUpsample } from '../survey/@types/StarAggregateUpsample';
import type { StarCatalogFacts } from './StarCatalogFacts';
import type { OctreeChunkStream } from '../../../@types/octree/OctreeChunkStream';
import type { OctreePoolHost } from '../../../@types/octree/OctreePoolHost';
import type { StarColumns } from '../survey/@types/StarColumns';
import type { CatalogPickCodes } from '../../../@types/engine/selection/CatalogPickCodes';

export type StarCatalogRuntime = {
  /** One slot per survey source. */
  readonly catalogs: ReadonlyMap<
    StarCatalogSourceType,
    AssetSlot<Octree<StarColumns>, StarCatalogReq>
  >;
  /** A source's chunk stream while its committed index names chunks; the slot's commit fills it and release clears it. */
  readonly chunkStreams: Map<StarCatalogSourceType, OctreeChunkStream<StarColumns>>;
  readonly famousStarsMeta: AssetSlot<FamousStarsPayload, void>;
  /** Catalog ↔ pick code; every pick word this Layer stamps or decodes goes through it. */
  readonly pickCodes: CatalogPickCodes<StarCatalogSourceType>;
  readonly renderer: StarCatalogRenderer;
  readonly pickRenderer: StarCatalogPickRenderer;
  readonly starRenderer: StarRenderer; // spheres (starSpheresPass, fieldStarSpherePass)
  readonly starPointRenderer: StarPointRenderer; // starPointsPass
  readonly aggregateUpsample: StarAggregateUpsample;
  /** Read by `resizeStarPools` (via `frame.ts`) to re-install pools; the slots hold the same object. */
  readonly poolHost: OctreePoolHost<StarColumns>;
  readonly publish: (patch: Partial<StarCatalogFacts>) => void;
};
