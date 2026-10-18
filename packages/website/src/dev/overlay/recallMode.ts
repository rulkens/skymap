import type { OverlayMode } from './@types/OverlayMode';
import { MODE_KEY } from './modeKey';

/** The mode last used in this browser, Notes when none was stored. localStorage, so it outlives the tab. */
export function recallMode(): OverlayMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'marks' ? 'marks' : 'notes';
  } catch {
    return 'notes';
  }
}
