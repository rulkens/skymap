/**
 * Label — a single world-anchored text label rendered by LabelRenderer.
 *
 * Glyphs of one label share world position, color, and fade state — see
 * the LabelRenderer module header for the per-label storage buffer
 * rationale.  This type is the public shape `setLabels(labels)` accepts.
 */

import type { Vec3 } from '../math/Vec3';
import type { Vec4 } from '../math/Vec4';
import type { LabelAlignX } from './LabelAlignX';

export type Label = {
  id: string;
  worldPos: Vec3;
  text: string;
  /** Target em pixel height at the label's natural viewing distance. */
  pixelSize: number;
  /** RGBA premultiplied, defaults to [1,1,1,1]. */
  color?: Vec4;
  /** Lower clamp on on-screen em height in pixels (default 8). */
  minPixelSize?: number;
  /** Upper clamp on on-screen em height in pixels (default 64). */
  maxPixelSize?: number;
  /**
   * World em size in Mpc — controls the natural distance at which
   * `pixelSize` is reached.  Default 0.01 Mpc/em (so a 24 px label
   * with worldEmMpc=0.01 reads at 24 px when ~0.01 Mpc away).
   */
  worldEmMpc?: number;
  /** Fade multiplier in [0,1] driven by youAreHereVisibility. Default 1. */
  fadeAlpha?: number;
  /**
   * Horizontal alignment of the text relative to `worldPos`.
   * Default 'left' (text extends rightward from the anchor).
   * 'center' centers the text horizontally on the anchor — the
   * "you are here" marker uses this so the vertical line passes
   * through the middle of the text.
   */
  alignX?: LabelAlignX;
};
