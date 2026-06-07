import type { Selection } from '../../../@types/engine/subsystems/Selection';

/**
 * structureIdOf — a Selection's structure id, or null for nothing / a galaxy.
 *
 * The marker and label producers both want "id if a structure is
 * select/focused, else null (a galaxy bumps/recedes no ring)" — one home for
 * that unwrap.
 */
export function structureIdOf(sel: Selection | null): string | null {
  return sel !== null && sel.kind === 'structure' ? sel.id : null;
}
