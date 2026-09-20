import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

/** An equirectangular GeoTIFF on a sphere, as `geoTiffHeightSource` and
 *  `geoTiffImagerySource` need it: `bounds` are the raster's OUTER pixel
 *  EDGES, not cell centres, so pixel `i`'s centre sits at
 *  `bounds.west + (i + 0.5) * (bounds.east - bounds.west) / width`. */
export type GeoTiffGrid = {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly bounds: LonLatBounds;
};
