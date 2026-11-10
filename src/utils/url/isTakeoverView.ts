import { TAKEOVER_KINDS } from '../../data/url/takeoverKinds';
import type { LinkView } from '../../@types/url/LinkView';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

/** True when the link opens a takeover (tour, exhibit, clip, studio) rather than a place. */
export function isTakeoverView(
  view: LinkView,
): view is Extract<LinkView, { kind: TakeoverSource['kind'] }> {
  return view.kind in TAKEOVER_KINDS;
}
