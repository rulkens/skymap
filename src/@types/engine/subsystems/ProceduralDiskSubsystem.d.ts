/**
 * ProceduralDiskSubsystem — LOD-1 per-frame planner.
 *
 * Walks the catalog under stride decimation, applies the
 * `px > PROCEDURAL_DISK_FADE_START_PX` + finite-orientation gate,
 * computes the crossfade alpha via the shared `maybeEmitProceduralDisk`
 * helper, updates sticky-instance state to absorb decimation, sorts
 * back-to-front, and stashes the result on `lastOutput`.
 *
 * No GPU work, no atlas dependency, no fetches — pure CPU.  The pass
 * file (`proceduralDisksPass.ts`) reads `lastOutput.instances` and
 * forwards them to `proceduralDiskRenderer.draw()` inside the existing
 * HDR render pass.
 */

import type { Destroyable } from '../../rendering/Destroyable';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { ProceduralDiskInstance } from '../../rendering/ProceduralDiskInstance';
import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { SourceType } from '../../data/SourceType';

export type ProceduralDiskFrameInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
};

export type ProceduralDiskFrameOutput = {
  /** Back-to-front sorted; consumer ships this array directly to the renderer. */
  readonly instances: readonly ProceduralDiskInstance[];
};

export type ProceduralDiskSubsystem = Destroyable & {
  /**
   * Pure CPU step.  See the module docstring for what it does.
   * Returns the output AND stashes it on `lastOutput` so the pass
   * file can read it without re-running.
   */
  runFrame(input: ProceduralDiskFrameInput): ProceduralDiskFrameOutput;

  /**
   * Latest output — read by `proceduralDisksPass.draw()` without
   * re-running.  Initialised to empty arrays so the pass reads valid
   * (empty) data before the first frame.
   */
  readonly lastOutput: ProceduralDiskFrameOutput;
};
