/**
 * AntiqueOrnamentInstance — one ornament placed for this frame, in device px:
 * what `packAntiqueOrnaments` writes and the plate shader composites.
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec4 } from '../math/Vec4';

export type AntiqueOrnamentInstance = {
  readonly centrePx: Vec2;
  readonly halfPx: Vec2;
  /** Counter-clockwise on screen, radians. */
  readonly rotation: number;
  readonly opacity: number;
  readonly clearsBeneath: boolean;
  readonly pigment: number;
  readonly accent: number;
  /** Rect, normalised: u0, v0, u1, v1, on the atlas or the lettering sheet. */
  readonly rect: Vec4;
  /** Drawn from the lettering sheet (a cartouche's title), not the ornament atlas. */
  readonly lettering: boolean;
};
