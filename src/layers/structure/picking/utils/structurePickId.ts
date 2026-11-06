/**
 * structurePickId — the word a structure's ring pick stamps (`ringPick.wesl`):
 * the category's pick code over the index within `byCategory(category)`.
 * The label producer and the selection row both build it here so a click on
 * the caption and on the ring name the same structure.
 */

import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { CatalogPickCodes } from '../../../../@types/engine/selection/CatalogPickCodes';

export function structurePickId(
  category: StructureId,
  categoryIndex: number,
  pickCodes: Pick<CatalogPickCodes<StructureId>, 'pickCodeOf'>,
): number {
  return packSelection(pickCodes.pickCodeOf(category), categoryIndex + PICK_SENTINEL_OFFSET);
}
