/**
 * AntiqueGlyphInstance — one digit of the border's numbering, placed this
 * frame in device px, with its rect on the glyph sheet (normalised).
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec4 } from '../math/Vec4';

export type AntiqueGlyphInstance = {
  readonly centrePx: Vec2;
  readonly halfPx: Vec2;
  readonly rect: Vec4;
};
