import type { FocusResolution } from '../../@types/engine/selection/FocusResolution';
import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';

/** The hit's ref, or null for a reader that has no use for waiting. */
export function refOfResolution(r: FocusResolution): SelectionRefBase | null {
  return r.kind === 'hit' ? r.ref : null;
}
