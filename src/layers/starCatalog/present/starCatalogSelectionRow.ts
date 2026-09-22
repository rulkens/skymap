/**
 * starCatalogSelectionRow — one selection kind for all four star catalogs. A
 * seeded pick names its table row (durable id, live position); a survey pick is
 * positional (the bin-stable record index), and a stale index after a tier swap
 * warns+nulls in `resolveStarRecord` rather than mis-resolving. THREE seed
 * tables (famousStar, sun, sStar), never merged — `ref.index` indexes ONE.
 */

import { SOLAR_RADIUS_KM } from '../../../data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';
import { STAR_FOCUS_PREFIX } from '../../../services/url/starFocusId';
import { encodeStarFocusId } from '../../../services/url/encodeStarFocusId';
import { decodeStarFocusId } from '../../../services/url/decodeStarFocusId';
import { resolveStarRecord } from '../../../services/engine/helpers/resolveStarRecord';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { STAR_CATALOG_SOURCE_ROWS } from '../sources/starCatalogSourceRows';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';

type StarCatalogRef = Extract<SelectionRef, { type: 'starCatalog' }>;

/** The headline a survey star gets: the bin carries no identity of its own. */
const FIELD_STAR_LABEL = 'Field star';

/** The first (only, in v1) committed Gaia catalog, or null before it lands. */
function currentCatalog(runtime: Pick<StarCatalogRuntime, 'renderer'>) {
  for (const { catalog } of runtime.renderer.loadedCatalogs()) return catalog;
  return null;
}

export function starCatalogSelectionRow(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
): SelectionKindRow<StarCatalogRef> {
  return {
    type: 'starCatalog',
    pickSources: STAR_CATALOG_SOURCE_ROWS.map(([code]) => code),
    resolvePick: (_entry, pick) => ({
      type: 'starCatalog',
      source: pick.sourceCode as StarCatalogSourceType,
      index: pick.localIdx,
    }),
    extractRow: (ref, simDays) => {
      const seededRow = SEEDED_STAR_CATALOGS_BY_SOURCE.get(ref.source);
      if (seededRow) {
        const star = seededRow.stars[ref.index];
        if (!star) return null;
        // The S-stars orbit, so a seeded star's position is the caller's instant,
        // never cached; the famous stars and the Sun are static anchors in it.
        const p = deriveBodyStates(simDays).get(star.id)!.positionMpc;
        return {
          type: 'starCatalog',
          source: ref.source,
          index: ref.index,
          id: star.id,
          label: star.label,
          positionMpc: [p[0], p[1], p[2]],
          radiusM: star.surface.datumRadiusM,
        };
      }
      const catalog = currentCatalog(runtime);
      if (!catalog) return null;
      const record = resolveStarRecord(catalog, ref.index);
      return record
        ? {
            type: 'starCatalog',
            source: ref.source,
            index: ref.index,
            id: null,
            label: FIELD_STAR_LABEL,
            positionMpc: record.positionMpc,
            radiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
            absMag: record.absMag,
            bpRp: record.bpRp,
          }
        : null;
    },
    focusId: {
      claims: (id) => id.startsWith(STAR_FOCUS_PREFIX),
      decode: (id) => decodeStarFocusId(id, currentCatalog(runtime) !== null),
      encode: (ref) => encodeStarFocusId(ref),
    },
  };
}
