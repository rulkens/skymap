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
  /**
   * @deprecated Legacy buffer slot — the shader no longer reads this.
   * The em height is now driven by `worldEmMpc` projected through
   * perspective (see `shaders/labels/vertex.wesl`).  Field is kept
   * in the type so existing call sites compile; it is written to the
   * GPU buffer but silently ignored by the sizing math.  Set to `0`
   * on new call sites; will be removed in a future cleanup once all
   * producers have migrated to `worldEmMpc`.
   */
  readonly pixelSize: number;
  /** RGBA premultiplied, defaults to [1,1,1,1]. */
  readonly color?: Vec4;
  /**
   * Floor clamp on the projected em height in screen pixels (default 8).
   * When the perspective projection of `worldEmMpc` falls below this
   * value (label is very far away), the label renders at exactly this
   * pixel height instead of shrinking further.
   */
  readonly minPixelSize?: number;
  /**
   * Ceiling clamp on the projected em height in screen pixels (default 64).
   * Prevents labels from becoming enormous when the camera is very close
   * to the anchor.
   */
  readonly maxPixelSize?: number;
  /**
   * PRIMARY size driver.  Em height expressed in Mpc of world space.
   * The vertex shader projects this through the anchor's clip.w to
   * obtain a screen-pixel height, then clamps to [minPixelSize, maxPixelSize].
   * Labels grow naturally as the camera approaches and shrink on zoom out,
   * bounded by the clamps.  Defaults to 0.01 in the renderer if absent.
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
