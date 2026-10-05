/**
 * coreSelectionRows — the two rows core owns; `createLayers` appends each
 * Layer's. `deps` is read lazily by each row (a thunk over live engine
 * resources), not called here, so a boot-window deep link resolves before any
 * cloud lands.
 */

import { structureSelectionRow } from './structureSelectionRow';
import { bodySelectionRow } from './bodySelectionRow';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

export function coreSelectionRows(deps: () => ResolveDeps): readonly SelectionKindRow[] {
  return [structureSelectionRow(deps), bodySelectionRow()];
}
