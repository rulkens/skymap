/** milkyWaySelectionRow — the singleton overlay: one tag, no per-instance data. */

import { milkyWayPickId } from '../../picking/present/milkyWayPickId';
import { MILKY_WAY_FOCUS_ID } from '../../../../services/url/milkyWayFocusId';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../../@types/engine/layer/SelectionKindRow';

type MilkyWayRef = Extract<SelectionRef, { type: 'milkyWay' }>;

export function milkyWaySelectionRow(pickCode: number): SelectionKindRow<MilkyWayRef> {
  return {
    type: 'milkyWay',
    pickSources: [pickCode],
    resolvePick: () => ({ type: 'milkyWay' }),
    encodePick: () => milkyWayPickId(pickCode),
    extractRow: () => ({ type: 'milkyWay' }),
    focusId: {
      claims: (id) => id === MILKY_WAY_FOCUS_ID,
      decode: () => ({ type: 'milkyWay' }),
      encode: () => MILKY_WAY_FOCUS_ID,
    },
  };
}
