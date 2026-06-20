import type { SelectionRef } from '../../../@types/engine/SelectionRef';

/**
 * structureIdOf — a ref's structure id, or null for nothing / a galaxy / the
 * Milky Way.
 *
 * The marker and label producers both want "id if a structure is
 * selected/focused, else null (a galaxy or MW bumps/recedes no ring)" — one
 * home for that unwrap.
 */
export function structureIdOf(ref: SelectionRef | null): string | null {
  return ref !== null && ref.type === 'structure' ? ref.id : null;
}
