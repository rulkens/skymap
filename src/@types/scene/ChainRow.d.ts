/**
 * ChainRow — one painter-chain row's slab index, distance interval (metres,
 * mirrors `Slab.distanceRangeM`), and on-screen bounding circle, as
 * `chainOverlapViolations`'s §7.2 painter-order check needs it.
 */

import type { Vec2 } from '../math/Vec2';

export type ChainRow = {
  readonly index: number;
  readonly distanceRangeM: readonly [number, number];
  /** Screen-space bounding circle of this row's drawn content, in CSS px. */
  readonly centrePx: Readonly<Vec2>;
  readonly radiusPx: number;
};
