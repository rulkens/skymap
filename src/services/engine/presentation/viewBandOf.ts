import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';
import type { Vec3 } from '../../../@types/math/Vec3';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { bandValueOf } from './bandValueOf';

/** An address's band value for one item, times its `of` entry's for a label with `of`: a
 * label follows its thing's distance bands item for item, as it follows its clip. */
export function viewBandOf(
  entries: readonly VisibilityEntry[],
  address: VisibilityAddress,
  item: string | undefined,
  view: { drawCamPos: Readonly<Vec3>; snapshot: Pick<ReadyFrameContext, 'bodyStates'> },
): number {
  const entry = visibilityEntryOf(entries, address);
  const own = bandValueOf(entry, item, view);
  if (own === 0 || !('label' in entry) || entry.of === undefined) return own;
  return own * bandValueOf(visibilityEntryOf(entries, entry.of as VisibilityAddress), item, view);
}
