/**
 * AntiqueSheetAssets — the look's static images on the GPU as they land: the
 * scanned paper tile and stain mask, the ornament atlas, the border's digits.
 * Each is null until its fetch resolves (or for good if it failed). Views are
 * made once at upload; the loader owns the textures behind them.
 */

import type { AntiqueGlyphSheet } from './AntiqueGlyphSheet';

export type AntiqueSheetAssets = {
  readonly paper: { readonly tile: GPUTextureView; readonly stains: GPUTextureView } | null;
  readonly ornaments: GPUTextureView | null;
  readonly glyphs: {
    readonly view: GPUTextureView;
    /** The bitmap is closed on upload, so only its layout is kept. */
    readonly sheet: Omit<AntiqueGlyphSheet, 'bitmap'>;
  } | null;
  destroy(): void;
};
