/** The quiet, ms between wheel EVENTS of one source, that makes a notch `fresh` (`inputSlice`): a
 * fresh notch at a zoom limit pushes it at once; a scroll still streaming pushes only once its
 * press fills `ZOOM_LIMIT_PUSH_LN`. */
export const FRESH_WHEEL_PAUSE_MS = 250;
