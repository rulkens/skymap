import type { DiskWalkInput } from '../DiskWalkInput';

/**
 * The procedural body's frame input EXTENDS the shared walk input (mirrors
 * how the textured body extends it) with the three live surface-brightness
 * sliders — Settings -> Galaxies -> Advanced's `sbScale` / `sbMax` /
 * `brightness`. These have to arrive per-frame so the sliders stay live;
 * the per-catalog zero-point they're applied against (`medianAbsMag`) is
 * NOT threaded here — the planner reads it straight off each row's
 * `catalog.medianAbsMag`, since it's already holding that catalog.
 */
export type ProceduralDiskFrameInput = DiskWalkInput & {
  readonly sbScale: number;
  readonly sbMax: number;
  readonly brightness: number;
};
