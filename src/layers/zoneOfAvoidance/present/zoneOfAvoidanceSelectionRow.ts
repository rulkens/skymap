/**
 * zoneOfAvoidanceSelectionRow — the dust-band singleton. No `focusId`: the
 * band has no position to fly to, so there is nothing for a `#focus=` hash
 * to name.
 */

import { Source } from '../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

type ZoneOfAvoidanceRef = Extract<SelectionRef, { type: 'zoneOfAvoidance' }>;

export function zoneOfAvoidanceSelectionRow(): SelectionKindRow<ZoneOfAvoidanceRef> {
  return {
    type: 'zoneOfAvoidance',
    pickSources: [Source.ZoneOfAvoidance],
    resolvePick: () => ({ type: 'zoneOfAvoidance' }),
    encodePick: () => packSelection(Source.ZoneOfAvoidance, 0 + PICK_SENTINEL_OFFSET),
    extractRow: () => ({ type: 'zoneOfAvoidance' }),
  };
}
