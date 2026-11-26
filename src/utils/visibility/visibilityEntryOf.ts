import type { VisibilityAddress } from '../../@types/animation/VisibilityAddress';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { visibilityAddressOf } from './visibilityAddressOf';

// Indexed once per entries array: a label entry's address is a built string, and the label
// stages look entries up per frame, so scanning would allocate one string per entry per lookup.
const indexes = new WeakMap<readonly VisibilityEntry[], Map<string, VisibilityEntry>>();

/** The composed entry an address names. Every address a consumer declares is typed from
 * `APP_VISIBILITY_REGISTRY`, so one with no composed entry is a Layer missing from the composition. */
export function visibilityEntryOf(
  entries: readonly VisibilityEntry[],
  address: VisibilityAddress,
): VisibilityEntry {
  let index = indexes.get(entries);
  if (index === undefined) {
    index = new Map();
    // First entry wins, as the scan this replaced did.
    for (const e of entries) {
      const key = visibilityAddressOf(e);
      if (!index.has(key)) index.set(key, e);
    }
    indexes.set(entries, index);
  }
  const entry = index.get(address);
  if (entry === undefined) throw new Error(`no composed visibility entry for '${address}'`);
  return entry;
}
