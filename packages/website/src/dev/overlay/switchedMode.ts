import type { OverlayMode } from './@types/OverlayMode';

/** The mode a key asks for from `current`, or null when the key is not a mode key. Tab flips; N and T pick. */
export function switchedMode(key: string, current: OverlayMode): OverlayMode | null {
  if (key === 'Tab') return current === 'notes' ? 'marks' : 'notes';
  if (key.toLowerCase() === 'n') return 'notes';
  if (key.toLowerCase() === 't') return 'marks';
  return null;
}
