import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';

/**
 * structureIdOf — a target's structure id, or null for nothing / a galaxy.
 *
 * The marker and label producers both want "id if a structure is
 * select/focused, else null (a galaxy bumps/recedes no ring)" — one home for
 * that unwrap.
 */
export function structureIdOf(target: FocusableTarget | null): string | null {
  return target !== null && target.type === 'structure' ? target.id : null;
}
