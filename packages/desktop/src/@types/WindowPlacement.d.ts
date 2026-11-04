import type { DisplayInfo } from './DisplayInfo';

/**
 * Where the sky and the control window go; `control` is null on a single screen. `storedMissing`:
 * a display was saved, but it is not connected, so the sky fell back to another.
 */
export type WindowPlacement = {
  sky: DisplayInfo;
  control: DisplayInfo | null;
  storedMissing: boolean;
};
