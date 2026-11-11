/** PhotoSun — where a photographic mosaic's baked-in Sun sits, as
 *  `delightedImagerySource` reconstructs it per coarse cell. `fixed` is one
 *  direction for the whole globe (Viking). `subsolar` is a mosaic stitched
 *  from orbits that each saw the Sun at the same local time, with a seam
 *  where that time flips from afternoon to morning (LROC WAC): the Sun stands
 *  over the equator `offsetDeg` of longitude away from every cell. */
export type PhotoSun =
  | {
      readonly kind: 'fixed';
      /** Azimuth, clockwise from north. */
      readonly azDeg: number;
      readonly elDeg: number;
    }
  | {
      readonly kind: 'subsolar';
      /** Longitude from a cell to its subsolar point: 90° minus the Sun's elevation at the equator. */
      readonly offsetDeg: number;
      /** The Sun is east of cells from −180° to here, west of cells from here to +180°. */
      readonly seamLonDeg: number;
    };
