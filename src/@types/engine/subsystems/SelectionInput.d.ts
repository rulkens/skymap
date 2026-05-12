import type { Source } from '../../../data/sources';

/**
 * A `(source, localIdx)` selection — what the picker decodes from its
 * r32uint readback, and what every selection-changing call site
 * forwards to this subsystem.  Two distinct slots (hovered / selected)
 * track independently because the user can hover one galaxy while
 * another stays pinned (CLAUDE.md captures the same invariant).
 */
export type SelectionInput = {
  source: Source;
  localIdx: number;
};
