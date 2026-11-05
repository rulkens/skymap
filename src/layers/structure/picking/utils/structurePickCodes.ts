/**
 * structurePickCodes — one pick code per structure category, keyed by the category's
 * registry id (`'galaxy-cluster'`, …), plus the inverse.
 */

import { STRUCTURE_IDS } from '../../../../data/structure/structureIds';
import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { StructurePickCodes } from '../@types/StructurePickCodes';

export function structurePickCodes(pickCode: (pickSourceId: string) => number): StructurePickCodes {
  const codeByCategory = new Map<StructureId, number>();
  const categoryByCode = new Map<number, StructureId>();
  for (const category of STRUCTURE_IDS) {
    const code = pickCode(category);
    codeByCategory.set(category, code);
    categoryByCode.set(code, category);
  }
  return {
    // Total: the map holds every member of the closed category union.
    codeOf: (category) => codeByCategory.get(category)!,
    categoryOf: (code) => categoryByCode.get(code) ?? null,
  };
}
