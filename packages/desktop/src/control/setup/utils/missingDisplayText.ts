import type { InstallSetup } from '../../../@types/InstallSetup';
import type { WindowPlacement } from '../../../@types/WindowPlacement';

/** What to say when the saved sky screen is not connected and the sky fell back to another; else null. */
export function missingDisplayText(
  stored: InstallSetup['display'],
  placement: WindowPlacement | null,
): string | null {
  if (stored === null || !placement?.storedMissing) return null;
  return `The saved screen (${stored.width}×${stored.height}) is not connected, so the sky is on display ${placement.sky.number}. It moves back when that screen is connected.`;
}
