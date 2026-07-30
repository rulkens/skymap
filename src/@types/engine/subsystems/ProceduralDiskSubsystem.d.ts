/**
 * ProceduralDiskSubsystem — LOD-1 per-frame planner.
 *
 * The shared disk-planner walk (`DiskPlannerWalk`) owns the catalog loop;
 * this subsystem exposes a row-reducer view onto it.  `beginFrame(input)`
 * returns the `DiskRowVisitor` whose `onRow` applies the
 * `px > PROCEDURAL_DISK_FADE_START_PX` + finite-orientation gate, computes
 * the crossfade alpha via the shared `maybeEmitProceduralDisk` helper, and
 * updates sticky-instance state to absorb decimation.  The visitor's
 * `endFrame` sorts back-to-front and stashes the result on `lastOutput`.
 *
 * No GPU work, no fetches — pure CPU.  An optional atlas dependency
 * (injected via `ProceduralDiskDeps.atlas`) is consulted per-row to
 * decide which Famous-source galaxies have their curated WebP loaded;
 * those instances get a ramped `procFadeOut` so the procedural pattern
 * crossfades out under the textured-disk pass instead of bleeding
 * through the photo.  When the atlas is omitted (tests that don't care
 * about the crossfade), every instance keeps the default 1.0
 * `procFadeOut` and the subsystem stays purely-CPU with no external
 * dependency.  The pass file (`proceduralDisksPass.ts`) reads
 * `lastOutput.instances` and forwards them to
 * `proceduralDiskRenderer.draw()` inside the existing HDR render pass.
 */

import type { Destroyable } from '../../rendering/Destroyable';
import type { ProceduralDiskInstance } from '../../rendering/ProceduralDiskInstance';
import type { DiskRowVisitor } from './DiskRowVisitor';
import type { DiskWalkInput } from './DiskWalkInput';

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

export type ProceduralDiskFrameOutput = {
  /** Back-to-front sorted; consumer ships this array directly to the renderer. */
  readonly instances: readonly ProceduralDiskInstance[];
};

export type ProceduralDiskSubsystem = Destroyable & {
  /**
   * Start a frame: returns the `DiskRowVisitor` the shared walk drives for
   * this frame.  The visitor closes over this subsystem's sticky maps and a
   * fresh per-frame output accumulator; its `endFrame` stashes the sorted
   * result on `lastOutput` so the pass file can read it without re-running.
   */
  beginFrame(input: ProceduralDiskFrameInput): DiskRowVisitor;

  /**
   * Latest output — read by `proceduralDisksPass.draw()` without
   * re-running.  Initialised to empty arrays so the pass reads valid
   * (empty) data before the first frame.
   */
  readonly lastOutput: ProceduralDiskFrameOutput;
};
