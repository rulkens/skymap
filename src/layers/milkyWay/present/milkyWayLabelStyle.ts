/**
 * milkyWayLabelStyle — visual style for the Milky Way "You are here" label:
 * a single text label lifted off the origin by a marker-line stem, no ring
 * or halo. `produceMilkyWayLabel` supplies the anchor + fade; this module
 * owns only the static appearance.
 *
 * Marker-lines and labels render AFTER the tone-map composite (see
 * `executeFrame.ts`), so `[1, 1, 1, 1]` is display white directly — no
 * exposure curve, no overshoot hack needed.
 */

import type { Vec4 } from '../../../@types/math/Vec4';

/** Style fields the Milky Way label producer reads. */
type MilkyWayLabelStyle = {
  /** Label glyph fill (straight RGBA — renderer premultiplies). */
  readonly labelColor: Vec4;
  /** Colour of the vertical marker-line stem lifting the label off the origin. */
  readonly lineColor: Vec4;
  /** Default label world-space em height (Mpc). */
  readonly worldEmMpc: number;
  /** Floor clamp on projected em height in screen pixels. */
  readonly minPixelSize: number;
  /** Ceiling clamp on projected em height in screen pixels. */
  readonly maxPixelSize: number;
  /** Marker-line stroke width in pixels. */
  readonly pixelWidth: number;
  /** Drop-shadow outline (straight RGBA — renderer premultiplies). */
  readonly outlineColor: Vec4;
  /** Outline width as an em-fraction. */
  readonly outlineEmFrac: number;
};

/** The single Milky Way label style. */
export const MILKY_WAY_LABEL_STYLE: MilkyWayLabelStyle = {
  labelColor: [1, 1, 1, 1],
  lineColor: [1, 1, 1, 1],
  worldEmMpc: 0.0125,
  minPixelSize: 45,
  maxPixelSize: 150,
  pixelWidth: 3,
  outlineColor: [0, 0, 0, 0.1],
  outlineEmFrac: 0.16,
};
