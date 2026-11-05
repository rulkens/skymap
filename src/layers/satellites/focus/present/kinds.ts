import { BODY_FOCUS } from '../../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';

export const satellitesSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'satellite' }>
>[] = [{ type: 'satellite', focus: BODY_FOCUS, mayHaveLabel: () => false }];
