/** The quiet, ms between wheel EVENTS, that makes a notch `fresh` (`replayInput`): a fresh notch at
 * a zoom limit pushes it at once; a scroll still streaming pushes only once its press fills
 * `ZOOM_LIMIT_PUSH_LN`. */
export const FRESH_WHEEL_PAUSE_MS = 250;
