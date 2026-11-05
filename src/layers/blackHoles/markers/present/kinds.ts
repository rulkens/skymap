import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';

export const blackHolesSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'blackHole' }>
>[] = [{ type: 'blackHole' }];
