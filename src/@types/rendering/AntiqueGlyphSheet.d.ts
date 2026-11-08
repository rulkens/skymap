/**
 * AntiqueGlyphSheet — the plate's lettering, set in IM Fell once on a canvas: the digits and
 * degree marks the border is numbered in, and every plate's cartouche title, each a block
 * shaped to the cartouche's interior. The bitmap plus each rect (px) on it.
 */

import type { AntiqueSheetRect } from './AntiqueSheetRect';
import type { AntiqueTitleKey } from './AntiqueTitleKey';

export type AntiqueGlyphSheet = {
  readonly bitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
  /** Every glyph's baseline, as a fraction of its rect's height from the top. */
  readonly baseline: number;
  readonly glyphs: Readonly<Record<string, AntiqueSheetRect>>;
  /** Each title set in full, and compact (its name alone) for a shrunken cartouche. */
  readonly titles: Readonly<
    Record<AntiqueTitleKey, { readonly full: AntiqueSheetRect; readonly compact: AntiqueSheetRect }>
  >;
};
