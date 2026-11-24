/**
 * MissionTrailGeometry — one craft's tessellated trail: vertex times (UT Julian
 * date, ascending) and f64 Mpc positions relative to `centreId`, three per
 * vertex. The trail rides its centre: the centre's position joins at draw. The
 * renderer splits positions into f32 hi/lo pairs itself, so the vertex layout
 * has one owner, and keeps both arrays for the per-frame vertex count.
 */

import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';

export type MissionTrailGeometry = {
  readonly id: string;
  readonly centreId: SceneBodyId;
  readonly tDays: Float64Array;
  readonly relMpc: Float64Array;
};
