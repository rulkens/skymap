/**
 * DiskPlannerWalk — the one per-frame catalog walk shared by the two disk
 * planners (LOD-1 procedural, LOD-2 textured). Row geometry (`camDistSq`,
 * `sqrt`, apparent `px`) is computed once and handed to two injected visitors
 * at two fixed, monomorphic call sites. A factory, not a pure helper, because
 * it owns the single per-source stride cursor map that `destroy()` clears.
 */

import type { Destroyable } from '../../rendering/Destroyable';
import type { DiskWalkInput } from './DiskWalkInput';
import type { DiskRowVisitor } from './DiskRowVisitor';

export type DiskPlannerWalk = Destroyable & {
  /** Applies NO `px` gate, only the looser 8-px squared-distance early-out; each visitor re-applies its own. */
  runFrame(input: DiskWalkInput, procedural: DiskRowVisitor, textured: DiskRowVisitor): void;
};
