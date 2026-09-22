/**
 * starCatalogSelectionRow — the survey-wide Gaia bin. Pick identity is
 * positional (the bin-stable global star-record index); a stale index after a
 * tier swap warns+nulls (`resolveStarRecord`) rather than mis-resolving.
 */

import { Source } from '../../../data/sources';
import { SOLAR_RADIUS_KM } from '../../../data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { STAR_FOCUS_PREFIX } from '../../../services/url/starFocusId';
import { resolveStarRecord } from '../../../services/engine/helpers/resolveStarRecord';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';

type StarRef = Extract<SelectionRef, { type: 'star' }>;

/** The first (only, in v1) committed Gaia catalog, or null before it lands. */
function currentCatalog(runtime: Pick<StarCatalogRuntime, 'renderer'>) {
  for (const { catalog } of runtime.renderer.loadedCatalogs()) return catalog;
  return null;
}

export function starCatalogSelectionRow(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
): SelectionKindRow<StarRef> {
  return {
    type: 'star',
    pickSources: [Source.GaiaStars],
    resolvePick: (_entry, pick) => ({ type: 'star', index: pick.localIdx }),
    extractRow: (ref) => {
      const catalog = currentCatalog(runtime);
      if (!catalog) return null;
      const record = resolveStarRecord(catalog, ref.index);
      return record
        ? {
            type: 'star',
            index: ref.index,
            positionMpc: record.positionMpc,
            absMag: record.absMag,
            bpRp: record.bpRp,
            radiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
          }
        : null;
    },
    focusId: {
      claims: (id) => id.startsWith(STAR_FOCUS_PREFIX),
      decode: (id) => {
        const n = id.slice(STAR_FOCUS_PREFIX.length);
        return /^\d+$/.test(n) ? { type: 'star', index: Number(n) } : null;
      },
      encode: (ref) => `${STAR_FOCUS_PREFIX}${ref.index}`,
    },
  };
}
