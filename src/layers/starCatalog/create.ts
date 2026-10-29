/**
 * create — the star family's whole construction, in dependency order: the
 * four renderers (the pick renderer must follow the visual renderer — it
 * borrows its exposed BGLs), the boot-seeded point renderer, the survey
 * slots, and the famous-star meta sidecar. The three seeded catalogs' counts
 * are the first yields of `starCatalogSourceCounts`, not a call from here.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { StarCatalogFacts } from './@types/StarCatalogFacts';
import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';
import type { OctreeChunkStream } from '../../@types/octree/OctreeChunkStream';
import type { SourceType } from '../../@types/data/SourceType';

import { HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT } from '../../data/renderTargetFormats';
import { SLAB_REVERSED_Z, NEAR0 } from '../../services/engine/frame/slabs';
import { CONST_J2000 } from '../../data/time/constJ2000';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { SEEDED_STAR_CATALOGS } from '../../data/bodies/seededStarCatalogs';
import { positionedSeededStars } from './present/positionedSeededStars';

import { createStarCatalogRenderer } from './render/starCatalogRenderer';
import { createStarCatalogPickRenderer } from './render/starCatalogPickRenderer';
import { createStarRenderer } from './render/starRenderer';
import { createStarPointRenderer } from './render/starPointRenderer';
import { createStarAggregateUpsample } from './render/starAggregateUpsample';
import type { OctreePoolHost } from '../../@types/octree/OctreePoolHost';
import { createStarCatalogSlot } from './load/starCatalogSlot';
import { createFamousStarsMetaSlot } from './load/famousStarsMetaSlot';
import { STAR_CATALOG_SOURCE_ROWS } from './sources/starCatalogSourceRows';
import type { StarColumns } from '../../@types/data/starCatalog/StarColumns';

export function create(deps: LayerCoreDeps<StarCatalogFacts>): StarCatalogRuntime {
  // `star-<id>` splits seeded from survey on the all-digits test
  // (`decodeStarFocusId`), so an all-digits seed id would silently deep-link to
  // a Gaia bin index instead of the star it names.
  for (const stars of Object.values(SEEDED_STAR_CATALOGS)) {
    for (const star of stars) {
      if (/^\d+$/.test(star.id)) {
        throw new Error(
          `starCatalog: seed id "${star.id}" is all digits, which a star- link reads as a survey index`,
        );
      }
    }
  }

  const device = deps.ctx.device;

  const renderer = createStarCatalogRenderer(device, HDR_TARGET_FORMAT);
  // Cross-handle read: borrows the visual renderer's exposed BGLs + records
  // bind group, so `renderer` must construct first.
  const pickRenderer = createStarCatalogPickRenderer(
    device,
    renderer.pickResources(),
    SLAB_REVERSED_Z[NEAR0]!,
  );
  const starRenderer = createStarRenderer(
    device,
    HDR_TARGET_FORMAT,
    FOREGROUND_DEPTH_FORMAT,
    SLAB_REVERSED_Z[NEAR0]!,
  );

  // The camera-free boot seed: the whole star list, positioned at the fixed
  // J2000 epoch (a star is a static anchor, so the epoch cannot move it).
  const starPointRenderer = createStarPointRenderer(device, HDR_TARGET_FORMAT);
  const bootBodyStates = deriveBodyStates(CONST_J2000);
  starPointRenderer.setStars(
    positionedSeededStars(
      Object.values(SEEDED_STAR_CATALOGS)
        .flat()
        .map((body) => ({ body, positionMpc: bootBodyStates.get(body.id)!.positionMpc })),
    ),
    // Boot seed, no frame yet — the main view's slot. `starPointsPass`
    // re-uploads every real frame, so this is overwritten before the first draw.
    0,
  );

  const aggregateUpsample = createStarAggregateUpsample(device, HDR_TARGET_FORMAT);

  const chunkStreams = new Map<SourceType, OctreeChunkStream<StarColumns>>();
  const poolHost: OctreePoolHost<StarColumns> = {
    renderer,
    chunkStreams,
    requestRender: deps.requestRender,
  };
  const catalogs = new Map(
    STAR_CATALOG_SOURCE_ROWS.filter(([, entry]) => entry.binBaseName !== null).map(
      ([source]) =>
        [
          source,
          createStarCatalogSlot(
            source,
            poolHost,
            () => deps.store.getState().settings.starCatalogs.chunkSlotsOverride,
          ),
        ] as const,
    ),
  );

  const famousStarsMeta = createFamousStarsMetaSlot(deps);

  return {
    catalogs,
    chunkStreams,
    famousStarsMeta,
    renderer,
    pickRenderer,
    starRenderer,
    starPointRenderer,
    aggregateUpsample,
    poolHost,
    publish: deps.publish,
  };
}
