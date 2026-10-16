import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';
import { visibilityAddressOf } from '../../../utils/visibility/visibilityAddressOf';

/** The composed entry an address names. Every address a consumer declares is typed from
 * `APP_VISIBILITY`, so one with no composed entry is a Layer missing from the composition. */
export function visibilityEntryOf(
  entries: readonly VisibilityEntry[],
  address: VisibilityAddress,
): VisibilityEntry {
  const entry = entries.find((e) => visibilityAddressOf(e) === address);
  if (entry === undefined) throw new Error(`no composed visibility entry for '${address}'`);
  return entry;
}
