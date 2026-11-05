import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';

export const structureSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'structure' }>
>[] = [{ type: 'structure' }];
