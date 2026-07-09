/**
 * milkyWayLabelStyle — visual style for the Milky Way "You are here" label.
 *
 * Like the famous-galaxy presentation, this is label-only: a single text
 * label lifted off the origin by a short marker-line stem, with no ring or
 * halo and none of the marker apparent-radius fade fields. The producer
 * (`produceMilkyWayLabel`) supplies the origin anchor + stem geometry and the
 * distance/layer fade; this module owns only the static appearance.
 *
 * ### LDR display colours
 *
 * Marker-lines and labels render in the swap render step AFTER the tone-map
 * composite (see `services/engine/frame/executeFrame.ts`), so they composite
 * directly onto the swap chain without going through the exposure curve.
 * `[1, 1, 1, 1]` is display white at any tone-map setting — no overshoot hack
 * needed. The soft black drop-shadow keeps the glyphs legible against the
 * starfield; re-tune by editing this module.
 *
 * Consolidating these constants into a style module matches the per-producer
 * style-module pattern the structure / famous producers already use, instead
 * of loose producer-scope consts.
 */

import type { Vec4 } from '../../../@types/math/Vec4';

/** Style fields the Milky Way label producer reads. */
export type MilkyWayLabelStyle = {
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
