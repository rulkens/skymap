/**
 * ScaleInfo — label and pixel width for the bottom-right distance legend bar.
 *
 * Computed engine-side each frame in `runFrame` from the current camera pose
 * and canvas dimensions, then dispatched to the store via `engineScaleChanged`.
 * The pure math lives in `services/engine/helpers/scaleBar.ts`
 * (`computeScaleInfo`); the reducer's dedup-on-write guard keeps autorotate
 * frames from re-rendering the ScaleBar when the label hasn't changed.
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
