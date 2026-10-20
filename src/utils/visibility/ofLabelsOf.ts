import type { VisibilityAddress } from '../../@types/animation/VisibilityAddress';
import type { LabelEntry } from '../../@types/engine/layer/LabelEntry';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

/** The label entries whose `of` names `address`: the one answer to "which labels follow this
 * thing", so a gate commit ramps the same labels the resolver clips by it. */
export function ofLabelsOf(
  entries: readonly VisibilityEntry[],
  address: VisibilityAddress,
): readonly LabelEntry[] {
  return entries.filter((e): e is LabelEntry => 'label' in e && e.of === address);
}
