import type { LinkTakeoverKind } from '../../@types/url/LinkTakeoverKind';

/** Every linkable takeover kind, keyed so a new `TakeoverSource` kind fails to compile until it is listed. */
export const TAKEOVER_KINDS: Record<LinkTakeoverKind, true> = {
  tour: true,
  exhibit: true,
  clip: true,
};
