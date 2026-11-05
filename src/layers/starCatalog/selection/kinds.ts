import { BODY_FOCUS } from '../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';

export const starCatalogSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'starCatalog' }>
>[] = [{ type: 'starCatalog', focus: BODY_FOCUS }];
