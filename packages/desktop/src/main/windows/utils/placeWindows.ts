import type { DisplayInfo } from '../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../@types/InstallSetup';
import type { WindowPlacement } from '../../../@types/WindowPlacement';

/**
 * Sky: the stored display, else the one display of its size (ids change on re-plug), else the
 * primary, so a projector switched on after boot takes the sky back on `display-added`.
 * Null with no displays at all, which `display-removed` can briefly report.
 */
export function placeWindows(
  stored: InstallSetup['display'],
  displays: readonly DisplayInfo[],
): WindowPlacement | null {
  const sameSize = displays.filter((d) => d.width === stored?.width && d.height === stored?.height);
  const found =
    displays.find((d) => d.id === stored?.id) ?? (sameSize.length === 1 ? sameSize[0] : undefined);
  const sky = found ?? displays.find((d) => d.primary) ?? displays[0];
  if (sky === undefined) return null;
  return {
    sky,
    control: displays.find((d) => d.id !== sky.id) ?? null,
    storedMissing: stored !== null && found === undefined,
  };
}
