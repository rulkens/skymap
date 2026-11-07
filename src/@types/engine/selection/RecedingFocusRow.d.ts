import type { FocusSphere } from '../../rendering/FocusSphere';

/**
 * A selection row whose focus recedes the rest of the scene (`emphasisOf`), so declared by its
 * Layer's `extractRow`; a row without `focusSphere` leaves the scene as it is. A sphere also dims
 * what lies outside it; null for an extent no sphere fits (a long thin stream would dim the wrong
 * galaxies and stars).
 */
export type RecedingFocusRow = {
  readonly type: string;
  readonly focusSphere: FocusSphere | null;
};
