/**
 * BodyRegion — one scale regime of the scene: where it is (`anchorId`), which
 * bodies sit in it (`memberIds`), and how far they reach around that anchor
 * (`extentMpc`). Near-field fade bands key on the camera's distance from the
 * anchor and scale off the extent, so content away from the Sun can be gated on
 * how close the camera is to IT rather than to the render origin.
 */

import type { BodyRegionId } from '../data/BodyRegionId';

export type BodyRegion = {
  readonly id: BodyRegionId;
  readonly label: string; // human-readable; the palette category chip reads this
  readonly anchorId: string;
  readonly memberIds: readonly string[]; // total + disjoint over SCENE_BODIES
  readonly extentMpc: number; // DERIVED max |member − anchor|, never authored; 0 when empty
};
