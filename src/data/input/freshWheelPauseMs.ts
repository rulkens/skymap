/** The quiet, ms between wheel EVENTS of one source, that makes a notch `fresh` (`inputSlice`):
 * a scroll still streaming (a trackpad's momentum tail) is never fresh, so it cannot push a limit. */
export const FRESH_WHEEL_PAUSE_MS = 250;
