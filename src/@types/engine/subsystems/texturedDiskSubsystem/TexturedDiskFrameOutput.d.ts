import type { DiskInstance } from '../../../rendering/DiskInstance';

export type TexturedDiskFrameOutput = {
  /** LOD-2 — galaxies with finite orientation, sorted back-to-front. */
  readonly disks: readonly DiskInstance[];
};
