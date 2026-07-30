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
import type {
  ProceduralDiskFrameInput,
  ProceduralDiskFrameOutput,
  ProceduralDiskSubsystem,
} from '../../../../src/@types/engine/subsystems/ProceduralDiskSubsystem';
import type {
  TexturedDiskFrameInput,
  TexturedDiskFrameOutput,
  TexturedDiskSubsystem,
} from '../../../../src/@types/engine/subsystems/TexturedDiskSubsystem';

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
  input: ProceduralDiskFrameInput,
): ProceduralDiskFrameOutput {
  walk.runFrame(input, sys.beginFrame(input), noopDiskRowVisitor());
  return sys.lastOutput;
}

/**
 * Run one frame of the textured body alone: the walk drives a no-op in the
 * procedural slot and the subsystem's visitor in the textured slot. Returns
 * `sys.lastOutput` (stashed by the visitor's `endFrame`) so call sites read
 * like the old single-subsystem frame call.
 */
export function runTexturedSolo(
  walk: DiskPlannerWalk,
  sys: TexturedDiskSubsystem,
  input: TexturedDiskFrameInput,
): TexturedDiskFrameOutput {
  walk.runFrame(input, noopDiskRowVisitor(), sys.beginFrame(input));
  return sys.lastOutput;
}
