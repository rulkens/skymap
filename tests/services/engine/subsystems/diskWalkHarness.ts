/**
 * diskWalkHarness — drives ONE disk-planner body through the shared walk with
 * the other visitor slot stubbed out.
 *
 * The disk subsystems no longer own a catalog loop: the unit under test is the
 * `DiskRowVisitor` returned by `beginFrame`, and only `createDiskPlannerWalk`
 * knows how to drive one. Without this harness every subsystem test would
 * hand-roll the same three-line walk call plus a stub visitor for the slot it
 * doesn't care about — so the "solo run" idiom lives here once, and the
 * subsystem suites keep asserting body behaviour (gates, sticky maps,
 * crossfades) exactly as before.
 */

import type { DiskPlannerWalk } from '../../../../src/@types/engine/subsystems/DiskPlannerWalk';
import type { DiskRowVisitor } from '../../../../src/@types/engine/subsystems/DiskRowVisitor';
import type { DiskWalkInput } from '../../../../src/@types/engine/subsystems/DiskWalkInput';
import type {
  ProceduralDiskFrameOutput,
  ProceduralDiskSubsystem,
} from '../../../../src/@types/engine/subsystems/ProceduralDiskSubsystem';

/** A visitor that ignores every walk callback — the "other slot" in solo runs. */
export function noopDiskRowVisitor(): DiskRowVisitor {
  return {
    onSourceHidden() {},
    beginSource() {},
    onRow() {},
    endSource() {},
    endFrame() {},
  };
}

/**
 * Run one frame of the procedural body alone: the walk drives the subsystem's
 * visitor in the procedural slot and a no-op in the textured slot. Returns
 * `sys.lastOutput` (stashed by the visitor's `endFrame`) so call sites read
 * like the old single-subsystem frame call.
 */
export function runProceduralSolo(
  walk: DiskPlannerWalk,
  sys: ProceduralDiskSubsystem,
  input: DiskWalkInput,
): ProceduralDiskFrameOutput {
  walk.runFrame(input, sys.beginFrame(input), noopDiskRowVisitor());
  return sys.lastOutput;
}
