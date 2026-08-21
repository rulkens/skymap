/**
 * famousLabelStyle — visual style for famous-galaxy text labels.
 *
 * Unlike the structure styles, the famous-galaxy presentation is label-only —
 * curated thumbnails handle the close-approach detail, so there is no ring or
 * halo and none of the marker apparent-radius fade fields. Famous galaxies
 * instead carry a per-entry apparent-size gate (`minApparentSizePx`) with a
 * `fadeBandPx` smoothstep, a connecting anchor `lineColor`, and a per-entry
 * `worldEmMpc` override (computed from the galaxy's diameter) — see
 * `produceFamousGalaxyLabels`.
 */

import type { Vec4 } from '../../../@types/math/Vec4';
import { hexToGl } from '../../../utils/color/hexToGl';

/** Style fields the famous-galaxy label producer reads. */
export type FamousLabelStyle = {
  /** Label glyph fill (straight RGBA). */
  readonly labelColor: Vec4;
  /** Colour of the vertical anchor line lifting the label off the dot. */
  readonly lineColor: Vec4;
  /** Floor clamp on projected em height in screen pixels. */
  readonly minPixelSize: number;
  /** Ceiling clamp on projected em height in screen pixels. */
  readonly maxPixelSize: number;
  /** Default label world-space em height (Mpc); per-entry override usually wins. */
  readonly worldEmMpc: number;
  /** Anchor-line stroke width in pixels. */
  readonly pixelWidth: number;
  /**
   * Smoothstep fade-band width (px) above the per-entry `minApparentSizePx`.
   * A galaxy whose apparent size lands inside `[min, min + fadeBandPx]` fades
   * in via smoothstep instead of popping; below the band it is skipped.
   */
  readonly fadeBandPx: number;
  /** Drop-shadow outline (straight RGBA — renderer premultiplies). */
  readonly outlineColor: Vec4;
  /** Outline width as an em-fraction. */
  readonly outlineEmFrac: number;
};

/** The single famous-galaxy label style (copied verbatim from STRUCTURE_MARKER_STYLES). */
export const FAMOUS_LABEL_STYLE: FamousLabelStyle = {
  labelColor: hexToGl('#FFF2CC'),
  lineColor: hexToGl('#E6D9B3'),
  minPixelSize: 30,
  maxPixelSize: 150,
  worldEmMpc: 0.0125,
  pixelWidth: 2.5,
  fadeBandPx: 4,
  outlineColor: [0, 0, 0, 0.1],
  outlineEmFrac: 0.16,
};
