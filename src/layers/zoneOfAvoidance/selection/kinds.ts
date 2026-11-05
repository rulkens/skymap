import { ZONE_OF_AVOIDANCE_INFO } from '../../../data/zoneOfAvoidance/zoneOfAvoidanceInfo';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';

export const zoneOfAvoidanceSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'zoneOfAvoidance' }>,
  Extract<SelectionRow, { type: 'zoneOfAvoidance' }>,
  Extract<FocusableTarget, { type: 'zoneOfAvoidance' }>
>[] = [
  // A band, not a point: nothing to frame.
  {
    type: 'zoneOfAvoidance',
    focus: null,
    mayHaveLabel: () => false,
    toFocusable: () => ({ ...ZONE_OF_AVOIDANCE_INFO, ref: { type: 'zoneOfAvoidance' } }),
    displayName: (target) => target.displayName,
  },
];
