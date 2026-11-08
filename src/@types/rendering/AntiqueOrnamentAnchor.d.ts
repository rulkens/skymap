/**
 * AntiqueOrnamentAnchor — where an ornament sits. `sky`: a constellation figure,
 * fitted each frame onto where its anchor stars project, so it lies on them in
 * any view. `space`: a place among the galaxies. (A cartouche sits on the sheet
 * instead: `AntiqueSheetAnchor`.)
 */
import type { AntiqueFigureAnchor } from './AntiqueFigureAnchor';

export type AntiqueOrnamentAnchor =
  | {
      readonly kind: 'sky';
      readonly stars: readonly AntiqueFigureAnchor[];
    }
  | {
      /**
       * A place in space (galactic l/b and distance from the Sun), sized in Mpc:
       * it grows and shrinks with distance like any object, and from far away it
       * stays where it is, not glued to a direction.
       */
      readonly kind: 'space';
      readonly lonDeg: number;
      readonly latDeg: number;
      readonly distMpc: number;
      /** Width in space, Mpc. */
      readonly sizeMpc: number;
    };
