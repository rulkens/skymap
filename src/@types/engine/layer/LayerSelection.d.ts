import type { SelectionKindFacts } from './SelectionKindFacts';
import type { SelectionKindRow } from './SelectionKindRow';

/** A Layer's selection contribution: each kind's static facts beside the runtime-bound rows. */
export type LayerSelection<Runtime> = {
  /** Static: one entry per kind this Layer owns. Readable before `create`. */
  readonly kinds: readonly SelectionKindFacts[];
  /** Folded by `composeSelectionRows`; `pickSources` are disjoint across Layers, asserted at boot. */
  rows(runtime: Runtime): readonly SelectionKindRow[];
};
