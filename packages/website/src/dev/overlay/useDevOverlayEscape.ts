import { useEffect } from 'react';

import { devOverlay } from './devOverlay';
import { useLatest } from './useLatest';

/** Offers Escape to `handler` (true: it used the key) for as long as the component is mounted. */
export function useDevOverlayEscape(handler: (e: KeyboardEvent) => boolean): void {
  const latest = useLatest(handler);
  useEffect(() => devOverlay.onEscape((e) => latest.current(e)), [latest]);
}
