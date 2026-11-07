/**
 * AntiqueOrnamentAnchor — where an ornament sits. `sky`: a direction on the
 * celestial sphere (equatorial or galactic degrees) with an angular size, so it
 * moves with the sky like a constellation figure. `sheet`: a fixed place on
 * the plate, in print units from a corner, like a cartouche.
 */
export type AntiqueOrnamentAnchor =
  | {
      readonly kind: 'sky';
      readonly frame: 'equatorial' | 'galactic';
      readonly lonDeg: number;
      readonly latDeg: number;
      /** Width on the sky, degrees. */
      readonly sizeDeg: number;
    }
  | {
      readonly kind: 'sheet';
      readonly corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
      /** Centre offset from the corner, print units, measured inward. */
      readonly insetUnits: readonly [number, number];
      /** Width, print units. */
      readonly sizeUnits: number;
    };
