import type { DisplayInfo } from '../@types/DisplayInfo.js';
import type { InstallSetup } from '../@types/InstallSetup.js';
import type { WindowPlacement } from '../@types/WindowPlacement.js';

/**
 * Sky: the stored display, else the one display of its size (ids change on re-plug), else the
 * primary, so a projector switched on after boot takes the sky back on `display-added`.
 */
export function placeWindows(
  stored: InstallSetup['display'],
  displays: readonly DisplayInfo[],
): WindowPlacement {
  const sameSize = displays.filter((d) => d.width === stored?.width && d.height === stored?.height);
  const sky =
    displays.find((d) => d.id === stored?.id) ??
    (sameSize.length === 1 ? sameSize[0] : undefined) ??
    displays.find((d) => d.primary) ??
    displays[0];
  if (sky === undefined) throw new Error('placeWindows: no displays');
  return { sky, control: displays.find((d) => d.id !== sky.id) ?? null };
}
