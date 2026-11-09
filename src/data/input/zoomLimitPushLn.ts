/** Σ |ln f| of non-fresh notches pressed in a row against a zoom limit that pushes it
 * (`replayInput`): a mouse notch is |ln f| ≈ 0.1 (`WHEEL_ZOOM_K`), so a steady scroll pushes on
 * the fourth, while a trackpad's decaying momentum tail runs out before it fills. */
export const ZOOM_LIMIT_PUSH_LN = 0.35;
