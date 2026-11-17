/** milkyWaySelectionRow — the singleton overlay: one tag, no per-instance data. */

import { milkyWayPickId } from '../picking/present/milkyWayPickId';
import { MILKY_WAY_FOCUS_ID } from '../../../services/url/milkyWayFocusId';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_DISC_RADIUS_KPC,
} from '../../../data/milkyWay/galacticCenter';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { MilkyWayRef } from './@types/MilkyWayRef';

export function milkyWaySelectionRow(pickCode: number): SelectionKindRow<MilkyWayRef> {
  return {
    type: 'milkyWay',
    pickSources: [pickCode],
    resolvePick: () => ({ type: 'milkyWay' }),
    encodePick: () => milkyWayPickId(pickCode),
    extractRow: () => ({
      type: 'milkyWay',
      positionMpc: [
        MILKY_WAY_CENTER_WORLD[0],
        MILKY_WAY_CENTER_WORLD[1],
        MILKY_WAY_CENTER_WORLD[2],
      ],
      radiusMpc: MILKY_WAY_DISC_RADIUS_KPC * SCALE_UNITS.KPC_TO_MPC,
    }),
    focusId: {
      claims: (id) => id === MILKY_WAY_FOCUS_ID,
      decode: () => ({ type: 'milkyWay' }),
      encode: () => MILKY_WAY_FOCUS_ID,
    },
  };
}
