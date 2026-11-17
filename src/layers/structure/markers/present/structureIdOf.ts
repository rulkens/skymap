import type { SelectionRefBase } from '../../../../@types/engine/selection/SelectionRefBase';
import { isKind } from '../../../../utils/selection/isKind';
import type { StructureRef } from '../../selection/@types/StructureRef';

/**
 * structureIdOf — a ref's structure id, or null for nothing / a galaxy / the
 * Milky Way.
 *
 * The marker and label producers both want "id if a structure is
 * selected/hovered/focused, else null (a galaxy or MW brightens no ring)" —
 * one home for that unwrap.
 */
export function structureIdOf(ref: SelectionRefBase | null): string | null {
  return isKind<StructureRef>(ref, 'structure') ? ref.id : null;
}
