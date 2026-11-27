/** DetailRegionDraw — one field's detail region for one frame, as the volume march reads it. Numbers
 *  only: it goes into the density accumulation key. */

import type { Vec3 } from '../math/Vec3';

export type DetailRegionDraw = {
  /** Read at weight 1. The stored box's local [0,1]³, inset half a native voxel; the high face is
   *  clamped to dataBox.dims first, so it stops short of the last z layer's zero padding. */
  readonly settledLo: Vec3;
  readonly settledHi: Vec3;
  /** Local [0,1]³ to region texture coordinates (repeat-sampled): dataBox.dims / (K · 48). */
  readonly texScale: Vec3;
  /** Native voxel edge, Mpc: the region is read only where a pixel spans less. */
  readonly voxelMpc: number;
  /** null = the steady pipeline. Framed and inset as above; an empty box is zero-sized at the origin. */
  readonly fade: {
    readonly intoLo: Vec3;
    readonly intoHi: Vec3;
    readonly outLo: Vec3;
    readonly outHi: Vec3;
    readonly w: number;
  } | null;
};
