import type { FocusSphere } from '../../rendering/FocusSphere';

/**
 * A selection row whose focus recedes the rest of the scene (`emphasisOf`), declared by its
 * Layer's `extractRow`; a row without `focusSphere` leaves the scene as it is. Galaxies, stars
 * and disks outside the sphere also dim and leave the pick; `RECEDE_ALL_FOCUS_SPHERE` holds
 * nothing, for an extent no sphere fits (a long thin stream).
 */
export type RecedingFocusRow = {
  readonly type: string;
  readonly focusSphere: FocusSphere;
};
