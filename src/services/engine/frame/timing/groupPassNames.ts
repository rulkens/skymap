/**
 * groupPassNames — group an arbitrary ordered name list (the DebugPanel
 * toggles' live pass names) into the same display groups as the timing list. A
 * name with no known groupKey (e.g. a stale/removed pass) falls back to a group
 * titled with the name itself rather than being dropped.
 */

import type { TimedSlotGroup } from '../../../../@types/engine/frame/TimedSlotGroup';
import { groupRows } from './groupRows';
import { PASS_GROUP_KEYS } from './passGroupKeys';

export function groupPassNames(names: readonly string[]): readonly TimedSlotGroup[] {
  return groupRows(names.map((name) => ({ name, groupKey: PASS_GROUP_KEYS.get(name) ?? name })));
}
