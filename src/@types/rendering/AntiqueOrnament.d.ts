/**
 * AntiqueOrnament — one decoration of the antique plate: which engraving, where
 * it is anchored, when it shows and how it is coloured. Rows live in
 * `data/rendering/antiqueOrnaments.ts`.
 */

import type { AntiqueOrnamentAnchor } from './AntiqueOrnamentAnchor';

export type AntiqueOrnament = {
  /** Key into the packed atlas (`data/rendering/antiqueOrnamentAtlas.ts`). */
  readonly sprite: string;
  readonly anchor: AntiqueOrnamentAnchor;
  /**
   * `stars`: near the Sun, where the constellations still outline (`ANTIQUE_FIGURE_VANTAGE_MPC`); `cosmos`: out
   * among the galaxies, where the Zone of Avoidance is real terra incognita.
   */
  readonly regime: 'stars' | 'cosmos';
  /** Turn so the engraving's own up points at celestial north on screen. */
  readonly facesNorth: boolean;
  /** Index into `pigments.wesl`'s PIGMENTS for the sprite's wash channel. */
  readonly pigment: number;
  readonly opacity: number;
  /** Clears the plate beneath its fill to bare paper (a sea beast), or lets it show (a constellation figure). */
  readonly clearsBeneath: boolean;
  /** Drawn left-for-right: a globe-view figure (Hevelius) on a sky-view plate. */
  readonly mirrored: boolean;
};
