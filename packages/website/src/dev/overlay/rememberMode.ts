import type { OverlayMode } from './@types/OverlayMode';
import { MODE_KEY } from './modeKey';

export function rememberMode(mode: OverlayMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* blocked storage: the mode lasts until reload */
  }
}
