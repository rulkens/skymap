import type { StructureId } from '../../../../@types/data/structure/StructureId';

/**
 * A structure category's pick code, asked of `LayerCoreDeps.pickCode` once per category.
 * The ring stamp, the labels and the selection row all read it.
 */
export type StructurePickCodes = {
  codeOf(category: StructureId): number;
  /** Null for a code another Layer owns. */
  categoryOf(code: number): StructureId | null;
};
