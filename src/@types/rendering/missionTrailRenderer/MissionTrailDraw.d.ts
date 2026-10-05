/**
 * MissionTrailDraw — one craft's trail for this frame: the first
 * `segmentCount` uploaded segments, plus an optional head segment from the last
 * visible vertex to the craft's own position (six f64 world-Mpc values: tail
 * then head), so the trail ends exactly on the mesh.
 */

import type { Vec3 } from '../../math/Vec3';

export type MissionTrailDraw = {
  readonly id: string;
  readonly color: Readonly<Vec3>;
  /** The fade opacity; multiplies the colour. */
  readonly opacity: number;
  readonly widthPx: number;
  readonly segmentCount: number;
  readonly headPosMpc: Float64Array | null;
};
