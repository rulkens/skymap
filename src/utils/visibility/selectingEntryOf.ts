import type { ShowEntry } from '../../@types/engine/layer/ShowEntry';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';

/** The show entry whose `selects` names a selection kind: the switch that hides that kind. */
export function selectingEntryOf(
  entries: readonly VisibilityEntry[],
  kind: SelectionRefBase['type'],
): ShowEntry | undefined {
  return entries.find((e): e is ShowEntry => 'key' in e && e.selects?.includes(kind) === true);
}
