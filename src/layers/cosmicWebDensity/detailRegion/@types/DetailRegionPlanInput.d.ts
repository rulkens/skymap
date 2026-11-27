import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';

export type DetailRegionPlanInput = {
  /** The dataBox's bricks per axis. */
  readonly grid: Vec3;
  /** The dataBox, native voxels. */
  readonly dims: Vec3;
  /** K: the region's bricks per axis. */
  readonly bricksPerAxis: number;
  /** The eye in native voxels from the dataBox origin; clamped into [0, dims] it is the centre. */
  readonly eyeVox: Vec3;
  /** The gate distance in native voxels: the largest target pxPerRad of the frame's views. A pixel
   *  d voxels away spans d / pxPerRad voxels, so beyond pxPerRad none is finer than one voxel. */
  readonly gateVox: number;
  /** The stream's isLoaded and isFailed. */
  readonly held: (brick: number) => boolean;
  readonly failed: (brick: number) => boolean;
  /** This frame's fade advance: max(dt / 200 ms, eye travel / half a brick). */
  readonly rampStep: number;
};
