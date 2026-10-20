import type { LabelCategory } from '../../@types/engine/data/LabelCategory';
import type { LabelEntry } from '../../@types/engine/layer/LabelEntry';
import { APP_VISIBILITY } from '../../compositions/appVisibility';

const LABEL_ENTRIES: readonly LabelEntry[] = APP_VISIBILITY.filter((e) => 'label' in e);

/** The label entry a panel label category reads and writes: the one whose items include it,
 * else the item-less entry named for it (the Milky Way's). */
export function labelEntryFor(category: LabelCategory): LabelEntry {
  const entry =
    LABEL_ENTRIES.find((e) => e.items?.includes(category)) ??
    LABEL_ENTRIES.find((e) => e.items === undefined && e.label === category);
  if (entry === undefined) throw new Error(`no label entry for category '${category}'`);
  return entry;
}
