import { screen } from 'electron';
import type { DisplayInfo } from '../../../@types/DisplayInfo';
import { toDisplayInfo } from './toDisplayInfo';

/** The connected displays in the OS's order: the one place they are numbered. */
export function listDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => toDisplayInfo(d, primary, i + 1));
}
