import { useEffect } from 'react';

import { devOverlay } from './devOverlay';
import { useLatest } from './useLatest';

/** Offers a press on the capture layer, by viewport point, to `handler` (true: it took the press). */
export function useDevOverlayPress(handler: (x: number, y: number) => boolean): void {
  const latest = useLatest(handler);
  useEffect(() => devOverlay.onPress((x, y) => latest.current(x, y)), [latest]);
}
