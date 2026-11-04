import type { DisplayInfo } from '../@types/DisplayInfo';

/** Displays are numbered from 1 in list order: their ids mean nothing to a person. */
export function displayOptionLabel(display: DisplayInfo, index: number): string {
  const primary = display.primary ? ' · primary' : '';
  return `Display ${index + 1} · ${display.width}×${display.height}${primary}`;
}
