/** milkyWaySelectionRow — the singleton overlay: one tag, no per-instance data. */

import { Source } from '../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { MILKY_WAY_FOCUS_ID } from '../../../services/url/milkyWayFocusId';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

type MilkyWayRef = Extract<SelectionRef, { type: 'milkyWay' }>;

export function milkyWaySelectionRow(): SelectionKindRow<MilkyWayRef> {
  return {
    type: 'milkyWay',
    pickSources: [Source.MilkyWay],
    resolvePick: () => ({ type: 'milkyWay' }),
    encodePick: () => packSelection(Source.MilkyWay, 0 + PICK_SENTINEL_OFFSET),
    extractRow: () => ({ type: 'milkyWay' }),
    focusId: {
      claims: (id) => id === MILKY_WAY_FOCUS_ID,
      decode: () => ({ type: 'milkyWay' }),
      encode: () => MILKY_WAY_FOCUS_ID,
    },
  };
}
