import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

/** Every takeover kind, keyed so a new `TakeoverSource` kind fails to compile until it is listed. */
export const TAKEOVER_KINDS: Record<TakeoverSource['kind'], true> = {
  tour: true,
  exhibit: true,
  clip: true,
  studio: true,
};
