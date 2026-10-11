/**
 * structurePickId — the word a structure's ring pick stamps (`ringPick.wesl`):
 * the category's source code over the index within `byCategory(category)`.
 * The label producer and the selection row both build it here so a click on
 * the caption and on the ring name the same structure.
 */

import { STRUCTURE_ID_CODES } from '../../data/structure/structureIds';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../data/selectionEncoding';
import type { StructureId } from '../../@types/data/structure/StructureId';

export function structurePickId(category: StructureId, categoryIndex: number): number {
  return packSelection(STRUCTURE_ID_CODES[category], categoryIndex + PICK_SENTINEL_OFFSET);
}
