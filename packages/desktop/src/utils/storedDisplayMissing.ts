import type { DisplayInfo } from '../@types/DisplayInfo.js';
import type { InstallSetup } from '../@types/InstallSetup.js';

/** True when the sky had to fall back from a stored display (not found by id or by its size). */
export function storedDisplayMissing(stored: InstallSetup['display'], sky: DisplayInfo): boolean {
  return (
    stored !== null &&
    sky.id !== stored.id &&
    !(sky.width === stored.width && sky.height === stored.height)
  );
}
