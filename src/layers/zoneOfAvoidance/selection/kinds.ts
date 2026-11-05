import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';

export const zoneOfAvoidanceSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'zoneOfAvoidance' }>
>[] = [
  // A band, not a point: nothing to frame.
  { type: 'zoneOfAvoidance', focus: null, mayHaveLabel: () => false },
];
