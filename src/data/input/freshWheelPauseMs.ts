/** The quiet, ms between wheel EVENTS, that makes a notch `fresh` (`replayInput`):
 * a scroll still streaming (a trackpad's momentum tail) is never fresh, so it cannot push a limit. */
export const FRESH_WHEEL_PAUSE_MS = 250;
