/**
 * ZoomStep — one wheel/pinch tick expressed in the two terms an orbit pose can
 * carry: a multiplicative distance change and a world-space lateral shift of
 * the pivot (`target`). Produced by `zoomedEyeStep`.
 *
 * A distance SCALE, not an absolute delta, because a tick can land in three
 * registers holding three different distances — the drag register, the store
 * `base`, and the follow driver's ease target (`clock.followDistanceTarget`,
 * which runs ahead of the rendered distance during an approach). A scale stays
 * proportionate in all three; a delta measured against the rendered eye does
 * not.
 */

import type { Vec3 } from '../math/Vec3';

export type ZoomStep = {
  /** Multiply the pose's `distance` by this. */
  readonly distanceScale: number;
  /**
   * World-space shift of the orbit pivot, Mpc — perpendicular to the view axis
   * by construction, so it never double-counts the distance term.
   */
  readonly lateralMpc: Vec3;
};
