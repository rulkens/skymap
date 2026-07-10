/**
 * DiskPlannerWalk — the single per-frame catalog walk shared by the two disk
 * planners (LOD-1 procedural + LOD-2 textured).
 *
 * ### Why one walk driving two visitors
 *
 * Each planner used to walk every visible catalog itself: read each row's
 * position, compute `camDistSq`, take a `sqrt`, and compute apparent `px`. That
 * geometry was computed twice per row and dominated frame CPU. This walk
 * computes each row's geometry ONCE and hands it to two injected row-reducers
 * (`procedural` first, `textured` second) at two fixed, monomorphic call sites.
 *
 * ### Why a stateful factory, not a pure helper
 *
 * The walk owns the SINGLE shared per-source stride cursor — genuine
 * cross-frame state with exactly one home. A factory owns it cleanly and keeps
 * the frame call site free of loose per-source bookkeeping; a pure `utils/`
 * helper would force the one cursor map to be threaded through every call.
 * `destroy()` clears that cursor map (the `Destroyable` contract every engine
 * subsystem satisfies).
 */

import type { Destroyable } from '../../rendering/Destroyable';
import type { DiskWalkInput } from './DiskWalkInput';
import type { DiskRowVisitor } from './DiskRowVisitor';

export type DiskPlannerWalk = Destroyable & {
  /**
   * Walk each visible catalog once under the shared stride cursor, computing
   * every surviving row's geometry a single time and driving `procedural`
   * then `textured` at two fixed statements per row. Applies NO `px` gate —
   * only the looser 8-px squared-distance early-out; each body re-applies its
   * own `px` gate inside `onRow`.
   */
  runFrame(input: DiskWalkInput, procedural: DiskRowVisitor, textured: DiskRowVisitor): void;
};
