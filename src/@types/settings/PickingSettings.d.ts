import type { SelectionKind } from '../engine/SelectionKind';

/**
 * PickingSettings — the `picking` settings cluster: which selection kinds
 * accept a scene click or hover. `Record`, not `Partial` or an array, so a
 * seventh `SelectionKind` fails to compile here until every author names it.
 */
export type PickingSettings = {
  /** Which selection kinds accept a scene click or hover. */
  readonly kinds: Record<SelectionKind, boolean>;
};
