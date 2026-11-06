/**
 * zoneOfAvoidanceSelectionRow — the dust-band singleton. No `focusId`: the
 * band has no position to fly to, so there is nothing for a `#focus=` hash
 * to name.
 */

import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import type { SelectionKindRow } from '../../../../@types/engine/layer/SelectionKindRow';
import type { ZoneOfAvoidanceRef } from '../../@types/ZoneOfAvoidanceRef';

export function zoneOfAvoidanceSelectionRow(
  pickCode: number,
): SelectionKindRow<ZoneOfAvoidanceRef> {
  return {
    type: 'zoneOfAvoidance',
    pickSources: [pickCode],
    resolvePick: () => ({ type: 'zoneOfAvoidance' }),
    encodePick: () => packSelection(pickCode, 0 + PICK_SENTINEL_OFFSET),
    extractRow: () => ({ type: 'zoneOfAvoidance' }),
  };
}
