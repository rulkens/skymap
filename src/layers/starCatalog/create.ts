/**
 * create — the star family's whole construction, in dependency order: the
 * four renderers (the pick renderer must follow the visual renderer — it
 * borrows its exposed BGLs), the boot-seeded point renderer, the survey
 * slots, and the famous-star meta sidecar. The three seeded catalogs (Sun,
 * S-stars, famous stars) report their counts here — they ship no `.bin`, so
 * there is no async slot commit to carry the usual pulse.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { SeededStarCatalogId } from '../../@types/data/starCatalog/SeededStarCatalogId';
import type { StarCatalogFacts } from './@types/StarCatalogFacts';
import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';

import { HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT } from '../../data/renderTargetFormats';
import { SLAB_REVERSED_Z, NEAR0 } from '../../services/engine/frame/slabs';
import { CONST_J2000 } from '../../data/time/constJ2000';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { visibleStars } from '../../services/engine/frame/visibleStars';
import { SEEDED_STAR_CATALOGS } from '../../data/bodies/seededStarCatalogs';

import { createStarCatalogRenderer } from './render/starCatalogRenderer';
import { createStarCatalogPickRenderer } from './render/starCatalogPickRenderer';
import { createStarRenderer } from './render/starRenderer';
import { createStarPointRenderer } from './render/starPointRenderer';
import { createStarAggregateUpsample } from './render/starAggregateUpsample';
import { createStarCatalogSlot } from './load/starCatalogSlot';
import { createFamousStarsMetaSlot } from './load/famousStarsMetaSlot';
import { STAR_CATALOG_SOURCE_ROWS } from './sources/starCatalogSourceRows';

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
    visibleStars(deps.store.getState().settings.starCatalogs).map((star) => ({
      ...star,
      positionMpc: bootBodyStates.get(star.id)!.positionMpc,
    })),
    // Boot seed, no frame yet — the main view's slot. `starPointsPass`
    // re-uploads every real frame, so this is overwritten before the first draw.
    0,
  );

  const aggregateUpsample = createStarAggregateUpsample(device, HDR_TARGET_FORMAT);

  const catalogs = new Map(
    STAR_CATALOG_SOURCE_ROWS.filter(([, entry]) => entry.binBaseName !== null).map(
      ([source]) => [source, createStarCatalogSlot(source, deps, renderer)] as const,
    ),
  );

  // The seeded catalogs ship no `.bin`, so there is no async commit to carry
  // the usual count pulse — report each here so the Stars panel's count
  // chips light up for them too.
  for (const [source, entry] of STAR_CATALOG_SOURCE_ROWS) {
    if (entry.binBaseName !== null) continue;
    deps.reportSourceCount(source, SEEDED_STAR_CATALOGS[entry.id as SeededStarCatalogId].length);
  }

  const famousStarsMeta = createFamousStarsMetaSlot(deps);

  return {
    catalogs,
    famousStarsMeta,
    renderer,
    pickRenderer,
    starRenderer,
    starPointRenderer,
    aggregateUpsample,
    publish: deps.publish,
  };
}
