/**
 * starSelectionRow — the survey-wide Gaia bin. Pick identity is positional
 * (the bin-stable global star-record index); a stale index after a tier swap
 * warns+nulls (`resolveStarRecord`) rather than mis-resolving.
 */

import { Source } from '../../../data/sources';
import { SOLAR_RADIUS_KM } from '../../../data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { STAR_FOCUS_PREFIX } from '../../url/starFocusId';
import { resolveStarRecord } from '../helpers/resolveStarRecord';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

type StarRef = Extract<SelectionRef, { type: 'star' }>;

export function starSelectionRow(
  deps: () => Pick<ResolveDeps, 'stars'>,
): SelectionKindRow<StarRef> {
  return {
    type: 'star',
    pickSources: [Source.GaiaStars],
    resolvePick: (_entry, pick) => ({ type: 'star', index: pick.localIdx }),
    extractRow: (ref) => {
      const catalog = deps().stars.current();
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
