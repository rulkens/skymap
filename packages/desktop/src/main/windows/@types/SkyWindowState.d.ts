import type { Rectangle } from 'electron';

/** How the sky was left, so a launch puts it back: full screen, or a window at its last bounds. */
export type SkyWindowState = { full: boolean; bounds: Rectangle | null };
