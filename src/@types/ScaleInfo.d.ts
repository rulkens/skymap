/**
 * ScaleInfo — label and pixel width for the bottom-right distance legend bar.
 * Emitted by the engine via onScaleChange whenever the camera zoom or viewport
 * size changes.
 */

/**
 * Distance scale for the bottom-right legend bar.
 *
 * The engine computes this from the camera distance and viewport height each
 * frame, deduplicates on `label + widthPx`, and fires `onScaleChange` only
 * when the value actually changes. React components receive it as props and
 * render it directly — no derived state needed.
 */
export type ScaleInfo = {
  /**
   * Pre-formatted human-readable label, e.g. "500 Mpc", "2 Gpc", "750 kpc".
   * Includes the unit suffix — render as plain text, no further formatting.
   */
  label: string;
  /** Width of the bar in CSS pixels at the current camera distance / viewport size. */
  widthPx: number;
};
