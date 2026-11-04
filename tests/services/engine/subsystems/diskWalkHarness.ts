/**
 * diskWalkHarness — drives ONE disk-planner body through the shared walk with
 * the other visitor slot stubbed out. The unit under test is the
 * `DiskRowVisitor` returned by `beginFrame`, and only `createDiskPlannerWalk`
 * knows how to drive one; the "solo run" idiom lives here once.
 */

import type { DiskPlannerWalk } from '../../../../src/layers/galaxyCatalog/lod/@types/DiskPlannerWalk';
import type { DiskRowVisitor } from '../../../../src/layers/galaxyCatalog/lod/@types/DiskRowVisitor';
import type { ProceduralDiskSubsystem } from '../../../../src/layers/galaxyCatalog/disks/procedural/@types/ProceduralDiskSubsystem';
import type { TexturedDiskSubsystem } from '../../../../src/layers/galaxyCatalog/disks/textured/@types/TexturedDiskSubsystem';
import type { TexturedDiskFrameInput } from '../../../../src/layers/galaxyCatalog/disks/textured/@types/TexturedDiskFrameInput';
import type { TexturedDiskFrameOutput } from '../../../../src/layers/galaxyCatalog/disks/textured/@types/TexturedDiskFrameOutput';
import type { ProceduralDiskFrameInput } from '../../../../src/layers/galaxyCatalog/disks/procedural/@types/ProceduralDiskFrameInput';
import type { ProceduralDiskFrameOutput } from '../../../../src/layers/galaxyCatalog/disks/procedural/@types/ProceduralDiskFrameOutput';

/** A visitor that ignores every walk callback — the "other slot" in solo runs. */
export function noopDiskRowVisitor(): DiskRowVisitor {
  return {
    onSourceHidden() {},
    beginBlock() {},
    onRow() {},
    endSource() {},
    endFrame() {},
  };
}

/**
 * Run one frame of the procedural body alone: the walk drives the subsystem's
 * visitor in the procedural slot and a no-op in the textured slot. Returns
 * `sys.lastOutput` (stashed by the visitor's `endFrame`).
 */
export function runProceduralSolo(
  walk: DiskPlannerWalk,
  sys: ProceduralDiskSubsystem,
  input: ProceduralDiskFrameInput,
): ProceduralDiskFrameOutput {
  walk.runFrame(input, sys.beginFrame(input), noopDiskRowVisitor());
  return sys.lastOutput;
}

/**
 * Run one frame of the textured body alone: the walk drives a no-op in the
 * procedural slot and the subsystem's visitor in the textured slot. Returns
 * `sys.lastOutput` (stashed by the visitor's `endFrame`).
 */
export function runTexturedSolo(
  walk: DiskPlannerWalk,
  sys: TexturedDiskSubsystem,
  input: TexturedDiskFrameInput,
): TexturedDiskFrameOutput {
  walk.runFrame(input, noopDiskRowVisitor(), sys.beginFrame(input));
  return sys.lastOutput;
}
