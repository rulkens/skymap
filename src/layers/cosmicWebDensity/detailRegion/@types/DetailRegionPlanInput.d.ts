import type { Vec3 } from '../../../../@types/math/Vec3';

export type DetailRegionPlanInput = {
  /** Bricks per axis. */
  readonly grid: Vec3;
  /** The dataBox, native voxels. */
  readonly dims: Vec3;
  /** K, from the tier. */
  readonly bricksPerAxis: number;
  /** The eye in native voxels from the dataBox origin, inside the box or not. The region centre
   *  is this point clamped into [0, dims]: the eye itself inside, the nearest point outside. */
  readonly eyeVox: Vec3;
  /** The gate distance in native voxels: the largest target pxPerRad of the frame's views. A pixel
   *  d voxels away spans d / pxPerRad voxels, so beyond pxPerRad none is finer than one voxel. */
  readonly gateVox: number;
  /** The stream's isLoaded. */
  readonly held: (brick: number) => boolean;
  /** The stream's isFailed. */
  readonly failed: (brick: number) => boolean;
  /** This frame's fade advance: max(dt / 200 ms, eye travel / half a brick). */
  readonly rampStep: number;
};
