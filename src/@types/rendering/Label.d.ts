/**
 * Label — a single world-anchored text label rendered by LabelRenderer.
 *
 * Glyphs of one label share world position, color, and fade state — see
 * the LabelRenderer module header for the per-label storage buffer
 * rationale.  This type is the public shape `setLabels(labels)` accepts.
 *
 * ## Why `font` is required (no default)
 *
 * The spec deliberately rejects a "default font" shim — every producer
 * MUST say which font it wants at the call site.  The alternative
 * (defaulting to the first registered font when omitted) would silently
 * route any future producer through whatever font happens to be at
 * FONT_IDS[0], which is the kind of implicit dependency the registry
 * was created to eliminate.  Adding a producer is one line; opting it
 * into the right font is one more line.
 */

import type { Vec3 } from '../math/Vec3';
import type { Vec4 } from '../math/Vec4';
import type { LabelAlignX } from './LabelAlignX';
import type { FontId } from '../../data/fonts';

export type Label = {
  readonly id: string;
  readonly worldPos: Vec3;
  readonly text: string;
  /** Registered FontId from `src/data/fonts.ts`.  Required — no default. */
  readonly font: FontId;
  /** Target em pixel height at the label's natural viewing distance. */
  readonly pixelSize: number;
  /** RGBA premultiplied, defaults to [1,1,1,1]. */
  readonly color?: Vec4;
  /** Lower clamp on on-screen em height in pixels (default 8). */
  readonly minPixelSize?: number;
  /** Upper clamp on on-screen em height in pixels (default 64). */
  readonly maxPixelSize?: number;
  /**
   * World em size in Mpc — controls the natural distance at which
   * `pixelSize` is reached.  Default 0.01 Mpc/em (so a 24 px label
   * with worldEmMpc=0.01 reads at 24 px when ~0.01 Mpc away).
   */
  readonly worldEmMpc?: number;
  /** Fade multiplier in [0,1] driven by youAreHereVisibility. Default 1. */
  readonly fadeAlpha?: number;
  /**
   * Horizontal alignment of the text relative to `worldPos`.
   * Default 'left' (text extends rightward from the anchor).
   * 'center' centers the text horizontally on the anchor — the
   * "you are here" marker uses this so the vertical line passes
   * through the middle of the text.
   */
  readonly alignX?: LabelAlignX;
};
