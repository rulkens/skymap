/**
 * AntiqueSheetAssets — the look's static images on the GPU as they land: the
 * scanned paper tile and stain mask, the ornament atlas, the border's digits.
 * Each is null until its fetch resolves (or for good if it failed).
 */

import type { AntiqueGlyphSheet } from './AntiqueGlyphSheet';

export type AntiqueSheetAssets = {
  readonly paper: { readonly tile: GPUTexture; readonly stains: GPUTexture } | null;
  readonly ornaments: GPUTexture | null;
  readonly glyphs: { readonly texture: GPUTexture; readonly sheet: AntiqueGlyphSheet } | null;
  destroy(): void;
};
