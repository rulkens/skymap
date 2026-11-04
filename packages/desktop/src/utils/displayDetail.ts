import type { DisplayInfo } from '../@types/DisplayInfo';

/** The line under a display's number: the OS's name for it, its size, and whether it is the primary. */
export function displayDetail({ label, width, height, primary }: DisplayInfo): string {
  return [label, `${width}×${height}`, primary && 'primary'].filter(Boolean).join('\u00a0· ');
}
