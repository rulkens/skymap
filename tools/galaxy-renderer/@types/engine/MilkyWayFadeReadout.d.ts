/**
 * MilkyWayFadeReadout — one frame's Milky-Way fade, factor by factor.
 *
 * The two bands MULTIPLY, so a single composed alpha cannot say which one is
 * doing the work — and "which band closed" is the question the tool's FADE
 * section exists to answer. Every input the bands key on is carried alongside
 * the factors they produced, so a surprising alpha can be traced back to a
 * distance or a pixel size without re-deriving either.
 */

export type MilkyWayFadeReadout = {
  /** Camera distance from the generator origin (= the galactic centre), kpc. */
  readonly centreDistKpc: number;
  /** Camera distance from the SELECTED anchor, kpc — what the bands key on. */
  readonly anchorDistKpc: number;
  /** The disc's apparent diameter at `anchorDistKpc`, canvas pixels. */
  readonly apparentPx: number;
  /** Near-side approach band, `[0, 1]`. */
  readonly approach: number;
  /** Far-side apparent-size band, `[0, 1]`. */
  readonly apparent: number;
  /** `approach * apparent` — what the cloud and the analytic field are scaled by. */
  readonly alpha: number;
};
