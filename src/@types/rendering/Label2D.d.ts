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
import type { LabelAlignY } from './LabelAlignY';
import type { FontId } from '../data/FontId';

export type Label2D = {
  readonly id: string;
  readonly worldPos: Vec3;
  readonly text: string;
  /** Registered FontId from `src/data/fonts.ts`.  Required — no default. */
  readonly font: FontId;
  /**
   * @deprecated Unread buffer slot — sizing is driven by `worldEmMpc`
   * projected through perspective (see `shaders/labels/vertex.wesl`).
   * The value is written to the GPU buffer but ignored by the sizing
   * math.  Set to `0` on new call sites.  Transitional: producers are
   * migrating to `worldEmMpc`.
   */
  readonly pixelSize: number;
  /**
   * Straight (non-premultiplied) RGBA fill colour, default `[1, 1, 1, 1]`.
   *
   * ## Convention
   *
   * Spell the colour the natural way — `[1, 0, 0, 0.5]` is
   * "half-transparent red".  The renderer's pack loop multiplies
   * `rgb * a` on write before uploading to the GPU storage buffer; the
   * fragment shader composites in premultiplied space.  Producers
   * therefore never have to think about premultiplication.
   *
   * The outline/glow colour fields below follow the same straight-RGBA
   * convention, so the colour API surface is uniform.
   */
  readonly color?: Vec4;
  /**
   * Outside-stroke outline colour (straight RGBA — renderer
   * premultiplies on write).  Default `[0, 0, 0, 0]`, which combined
   * with `outlineEmFrac = 0` collapses the outline band to zero
   * contribution.  Composited OVER the fill in premultiplied space.
   */
  readonly outlineColor?: Vec4;
  /**
   * Outline width as a fraction of the projected em height.  Default
   * `0`.  Em-fraction so the outline scales naturally with the label's
   * perspective-driven sizing clamp.
   */
  readonly outlineEmFrac?: number;
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
  /** Fade multiplier in [0,1] driven by milkyWayLabelVisibility. Default 1. */
  readonly fadeAlpha?: number;
  /**
   * Horizontal alignment of the text relative to `worldPos`.
   * Default 'left' (text extends rightward from the anchor).
   * 'center' centers the text horizontally on the anchor — the
   * "you are here" marker uses this so the vertical line passes
   * through the middle of the text.
   */
  readonly alignX?: LabelAlignX;
  /**
   * Vertical alignment of the text relative to `worldPos`.
   * Default 'baseline' (anchor sits on the text baseline; descenders
   * hang below).  Structure rings use 'center' so the label visually
   * straddles the ring centre rather than hanging beneath it.
   */
  readonly alignY?: LabelAlignY;
  /**
   * On-screen prominence (apparent size, px) used as the declutter sort
   * key by the `labelDirector` merge: a ring's apparent radius for a
   * structure, a galaxy's apparent diameter for a famous label.  When two
   * labels' measured text rects overlap on screen, the higher
   * `prominencePx` wins.  The label renderer ignores this field — it exists
   * only to carry the producer's size signal across the director's
   * cross-producer declutter.  Absent → treated as 0 (lowest priority).
   */
  readonly prominencePx?: number;
};
