/**
 * zoneOfAvoidanceSelectionRow — the dust-band singleton. No `focusId`: the
 * band has no position to fly to, so there is nothing for a `#focus=` hash
 * to name.
 */

import { Source } from '../../../data/sources';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

type ZoneOfAvoidanceRef = Extract<SelectionRef, { type: 'zoneOfAvoidance' }>;

export function zoneOfAvoidanceSelectionRow(): SelectionKindRow<ZoneOfAvoidanceRef> {
  return {
    type: 'zoneOfAvoidance',
    pickSources: [Source.ZoneOfAvoidance],
    resolvePick: () => ({ type: 'zoneOfAvoidance' }),
    extractRow: () => ({ type: 'zoneOfAvoidance' }),
  };
}
