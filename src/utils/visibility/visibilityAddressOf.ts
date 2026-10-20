import type { VisibilityAddress } from '../../@types/animation/VisibilityAddress';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

/** An entry's bare address. The cast is the one bridge from the entry's `string` fields to the
 * derived union: every composed entry is in `APP_VISIBILITY`, which the union derives from. */
export function visibilityAddressOf(entry: VisibilityEntry): VisibilityAddress {
  return ('key' in entry ? entry.key : `label:${entry.label}`) as VisibilityAddress;
}
