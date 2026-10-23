/**
 * SurfaceTileOver — the tiling body the eye is over: the nearest one within
 * its `TILE_RELEASE_RADII`, from position alone. No visibility gate, so
 * looking up from street level keeps it (and the atlases, and the readout).
 */

import type { SurfaceTileBodyId } from '../../data/SurfaceTileBodyId';
import type { SceneBodyId } from '../../scene/SceneBodyId';
import type { Vec3 } from '../../math/Vec3';

export type SurfaceTileOver = {
  readonly bodyId: SceneBodyId & SurfaceTileBodyId;
  /** Eye − body centre in the body's fixed axes, metres (`BodyRelativePose.eyeRelBodyM`). */
  readonly camPosLocalM: Readonly<Vec3>;
};
