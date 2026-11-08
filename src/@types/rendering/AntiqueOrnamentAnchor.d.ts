/**
 * AntiqueOrnamentAnchor — where an ornament sits. `sky`: an equatorial RA/Dec
 * direction with an angular size, so it moves with the sky like a
 * constellation figure. `space`: a place among the galaxies. (A cartouche
 * sits on the sheet instead: `AntiqueSheetAnchor`.)
 */
export type AntiqueOrnamentAnchor =
  | {
      readonly kind: 'sky';
      readonly lonDeg: number;
      readonly latDeg: number;
      /** Width on the sky, degrees. */
      readonly sizeDeg: number;
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
