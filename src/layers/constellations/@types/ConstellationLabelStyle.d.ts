import type { Vec4 } from '../../../@types/math/Vec4';

/** Style fields the constellation label producer reads. */
export type ConstellationLabelStyle = {
  /** Label glyph fill (straight RGBA — renderer premultiplies). */
  readonly labelColor: Vec4;
  /** Label world-space em height (Mpc) — the near-field, parsec-scale anchor. */
  readonly worldEmMpc: number;
  /** Floor clamp on projected em height in screen pixels. */
  readonly minPixelSize: number;
  /** Ceiling clamp on projected em height in screen pixels. */
  readonly maxPixelSize: number;
  /** Drop-shadow outline (straight RGBA — renderer premultiplies). */
  readonly outlineColor: Vec4;
  /** Outline width as an em-fraction. */
  readonly outlineEmFrac: number;
};
