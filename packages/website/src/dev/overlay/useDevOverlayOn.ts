import { useSyncExternalStore } from 'react';

import { devOverlay } from './devOverlay';

export function useDevOverlayOn(): boolean {
  return useSyncExternalStore(devOverlay.subscribe, devOverlay.isOn);
}
