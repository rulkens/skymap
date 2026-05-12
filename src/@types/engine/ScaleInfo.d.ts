/**
 * ScaleInfo — label and pixel width for the bottom-right distance legend bar.
 *
 * Computed React-side from the camera snapshot the engine emits via
 * `cb.onCameraChange`.  The pure math lives in
 * `services/engine/helpers/scaleBar.ts` (`computeScaleInfo`); React stores
 * the latest value in a `useState` slot whose default equality check
 * filters unchanged emissions.
 *
 * Pre-extraction the engine owned this computation, dedup'd on a closure-
 * captured `lastScaleSig`, and pushed via `onScaleChange`.  The lift to
 * React lets the engine shed scale-bar state entirely and treat camera
 * mutations as the single signal — UI derivation is a React concern.
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
