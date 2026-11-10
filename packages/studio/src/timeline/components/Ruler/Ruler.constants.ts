/** Shift-scrubbing moves the playhead this fraction of the pointer's distance. */
export const FINE_FACTOR = 0.1;
/** Track width assumed before the ruler is measured (and where there is no ResizeObserver). */
export const FALLBACK_TRACK_PX = 800;
/** Float slack when asking whether a tick time is a whole multiple of the major step. */
export const EPSILON = 1e-6;
/** The `after end` caption's footprint at the ruler's right edge, and a tick label's: labels that would reach into it are dropped (px). */
export const AFTER_END_CAPTION_PX = 72;
export const TICK_LABEL_PX = 40;
