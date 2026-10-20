import { useSyncExternalStore } from 'react';

import type { OverlayMode } from './@types/OverlayMode';
import { devOverlay } from './devOverlay';

export function useDevOverlayMode(): OverlayMode {
  return useSyncExternalStore(devOverlay.subscribe, devOverlay.mode);
}
