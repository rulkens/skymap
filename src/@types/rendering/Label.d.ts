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
   * convention — uniformity across the colour API surface is the whole
   * point of carrying out this migration alongside the effects work.
   */
  readonly color?: Vec4;
  /**
   * Straight (non-premultiplied) RGBA colour of the outside outline
   * stroke.  Default `[0, 0, 0, 0]` — fully transparent, which combined
   * with `outlineEmFrac = 0` collapses the outline band to zero
   * contribution in the fragment shader.  The renderer premultiplies on
   * write (same convention as `color`).
   *
   * The outline is composited OVER the fill in premultiplied space, so a
   * 50%-alpha outline correctly half-blends with whatever sits behind
   * the label.
   */
  readonly outlineColor?: Vec4;
  /**
   * Outline width as a fraction of the projected em height.  Default
   * `0`.  Example: `0.05` on a 40-px-tall label gives a 2-px-wide
   * outline; on a 60-px label the same fraction grows to 3 px.
   *
   * ## Why em-fraction instead of pixels
   *
   * The label sizing pipeline clamps the projected em height to
   * `[minPixelSize, maxPixelSize]`; an em-fraction outline naturally
   * inherits that clamp.  A pixel-absolute outline would visually
   * dominate at the `minPixelSize` floor (where the glyph itself is
   * tiny) and vanish at the `maxPixelSize` ceiling.
   *
   * Outside stroke — the outline grows outward from the glyph contour;
   * the glyph body stays its natural size.
   */
  readonly outlineEmFrac?: number;
  /**
   * Straight RGBA colour of the soft outside glow halo.  Default
   * `[0, 0, 0, 0]`.  Same renderer-premultiplies-on-write convention as
   * `color`.
   *
   * The glow is composited OVER (not additive) — alpha-blended onto the
   * background like a translucent plate.  Additive would have vanished
   * against bright backgrounds (the Milky Way, dense cluster fields),
   * which is exactly where labels need to stand out most.
   */
  readonly glowColor?: Vec4;
  /**
   * Glow radius as a fraction of the projected em height.  Default `0`.
   * The glow extends from the glyph contour (`d = 0`) outward by this
   * amount with a smoothstep falloff; the visible halo's outer edge sits
   * at `glowEmFrac * displayEmPx` screen pixels past the glyph edge.
   *
   * ## Why em-fraction
   *
   * Same rationale as `outlineEmFrac` — the halo naturally inherits the
   * projected-em-height clamp.
   *
   * ## Band overlap with outline
   *
   * The glow extends from `d = 0` regardless of `outlineEmFrac`; the
   * outline overlays the inner portion when both are active.  Visible
   * total halo extent is `max(outlineEmFrac, glowEmFrac)`.  Toggling the
   * outline off does not change the overall label silhouette.
   */
  readonly glowEmFrac?: number;
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
  /**
   * Vertical alignment of the text relative to `worldPos`.
   * Default 'baseline' (anchor sits on the text baseline; descenders
   * hang below).  POI rings use 'center' so the label visually
   * straddles the ring centre rather than hanging beneath it.
   */
  readonly alignY?: LabelAlignY;
};
