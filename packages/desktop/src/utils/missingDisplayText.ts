import type { DisplayInfo } from '../@types/DisplayInfo';
import type { InstallSetup } from '../@types/InstallSetup';
import { placeWindows } from '../main/placeWindows';
import { storedDisplayMissing } from './storedDisplayMissing';

/** What to say when the saved sky screen is not connected and the sky fell back to another; else null. */
export function missingDisplayText(
  stored: InstallSetup['display'],
  displays: readonly DisplayInfo[],
): string | null {
  const sky = placeWindows(stored, displays)?.sky;
  if (stored === null || sky === undefined || !storedDisplayMissing(stored, sky)) return null;
  const at = displays.indexOf(sky) + 1;
  return `The saved screen (${stored.width}×${stored.height}) is not connected, so the sky is on display ${at}. It moves back when that screen is connected.`;
}
