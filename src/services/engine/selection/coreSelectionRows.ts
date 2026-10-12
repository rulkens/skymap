/**
 * coreSelectionRows — the rows core owns; `createLayers` appends each Layer's.
 */

import { bodySelectionRow } from './bodySelectionRow';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

export function coreSelectionRows(): readonly SelectionKindRow[] {
  return [bodySelectionRow()];
}
