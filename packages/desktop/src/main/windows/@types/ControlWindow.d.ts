import type { BrowserWindow } from 'electron';

/** The control window, and the one way to raise it: `show` waits for its first paint. */
export type ControlWindow = { window: BrowserWindow; show: () => void };
