import type { Display } from 'electron';
import type { DisplayInfo } from '../@types/DisplayInfo';

/** Physical pixels, so a stored size survives the OS scale setting changing. */
export function toDisplayInfo(display: Display, primaryId: number): DisplayInfo {
  return {
    id: display.id,
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
    primary: display.id === primaryId,
  };
}
