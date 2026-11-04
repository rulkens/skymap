import type { DisplayInfo } from '../@types/DisplayInfo';
import type { InstallSetup } from '../@types/InstallSetup';

/** The setup's display for a picked option value; the empty value, or an unknown id, is the primary. */
export function chosenDisplay(
  displays: readonly DisplayInfo[],
  value: string,
): InstallSetup['display'] {
  const picked = displays.find((d) => String(d.id) === value);
  return picked === undefined
    ? null
    : { id: picked.id, width: picked.width, height: picked.height };
}
