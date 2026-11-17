import { ZONE_OF_AVOIDANCE_INFO } from '../../../data/zoneOfAvoidance/zoneOfAvoidanceInfo';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { ZoneOfAvoidanceRef } from './@types/ZoneOfAvoidanceRef';
import type { ZoneOfAvoidanceTarget } from './@types/ZoneOfAvoidanceTarget';

export const zoneOfAvoidanceSelectionKinds: readonly SelectionKindFacts<
  ZoneOfAvoidanceRef,
  ZoneOfAvoidanceRef,
  ZoneOfAvoidanceTarget
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
