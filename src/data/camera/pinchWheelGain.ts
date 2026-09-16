/** Trackpad pinch arrives as a ctrl-wheel with deltaY ~1–10 per event (Chrome,
 * Edge, Firefox; macOS and Windows) against ~100 for a mouse notch, so it gets
 * its own multiplier on top of WHEEL_ZOOM_K. A real Ctrl+mouse-wheel is
 * indistinguishable and zooms faster too. */
export const PINCH_WHEEL_GAIN = 8;
