import { BODY_FOCUS } from '../../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';

export const earthScenesSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'earthScene' }>
>[] = [{ type: 'earthScene', focus: BODY_FOCUS, mayHaveLabel: () => false }];
