import type { FocusSphere } from '../../rendering/FocusSphere';

/**
 * A selection row whose focus recedes the rest of the scene (`emphasisOf`), declared by its
 * Layer's `extractRow`; a row without `focusRegion` leaves the scene as it is. Galaxies, stars
 * and disks outside the region also dim and leave the pick.
 */
export type RecedingFocusRow = {
  readonly type: string;
  /** What stays bright while the rest recedes: a sphere of the scene, or only the subject itself. */
  readonly focusRegion: FocusSphere | 'subjectOnly';
};
