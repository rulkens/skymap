import type { DisplayInfo } from './DisplayInfo.js';

/** Where the sky and the control window go; `control` is null on a single screen. */
export type WindowPlacement = { sky: DisplayInfo; control: DisplayInfo | null };
