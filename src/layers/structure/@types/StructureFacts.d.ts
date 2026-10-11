/**
 * What the structure Layer publishes into `state.engine.structure`: the
 * Structures panel's per-category counts, the command palette's search list,
 * and the bulk slot's status, which the focus tween reads to tell a structure
 * still loading from a bad id.
 */

import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { StructureSearchEntry } from '../../../@types/engine/StructureSearchEntry';

export type StructureFacts = {
  readonly counts: Partial<Record<StructureId, number>>;
  readonly searchList: readonly StructureSearchEntry[];
  /** The bulk slot's `LoadState.kind`, with 'committing' folded into 'loading'. */
  readonly bulk: 'idle' | 'loading' | 'ready' | 'error';
};
