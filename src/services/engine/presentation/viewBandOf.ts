import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { bandValueOf } from './bandValueOf';

/** An address's band value for one item, times its `of` entry's for a label with `of`: a
 * label follows its thing's distance bands item for item, as it follows its clip. */
export function viewBandOf(
  entries: readonly VisibilityEntry[],
  address: VisibilityAddress,
  item: string | undefined,
  view: Pick<FrameView, 'drawCamPos' | 'snapshot'>,
): number {
  const entry = visibilityEntryOf(entries, address);
  const own = bandValueOf(entry, item, view);
  if (own === 0 || !('label' in entry) || entry.of === undefined) return own;
  return own * bandValueOf(visibilityEntryOf(entries, entry.of as VisibilityAddress), item, view);
}
