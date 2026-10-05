/**
 * etopoHeightSource — the global `HeightSource`: ETOPO 2022 30″ surface
 * elevation, a 43200×21600 float32 GeoTIFF with bathymetry included
 * (`data/raw/etopo/README.md`), read through `geoTiffHeightSource`. Size is
 * read off the file, not compiled in, so a future 15″ release needs only a
 * registry edit and a `maxLevel` bump.
 */

import sharp from 'sharp';

import type { HeightSource } from './@types/HeightSource';
import { geoTiffHeightSource } from './geoTiffHeightSource';
import { rawDataPath } from '../utils/io/rawDataRegistry';

/** 30″ posts are 926 m; z8's lattice step is 1222 m, the deepest level this
 *  still resolves (spec §4.1's z8.4). */
const ETOPO_MAX_LEVEL = 8;

/** `gdalinfo`'s `NoData Value` for the shipped GeoTIFF. */
const ETOPO_NODATA = -99999;

const WHOLE_GLOBE = { west: -180, east: 180, south: -90, north: 90 } as const;

const ETOPO_PROVENANCE = {
  sourceId: 'etopo-2022-30s-surface',
  attribution:
    'ETOPO 2022 15 Arc-Second Global Relief Model (30″ surface-elevation ' +
    'product), NOAA National Centers for Environmental Information, ' +
    'DOI 10.25921/fd45-gt74 — public domain.',
  vintage: '2022',
} as const;

export async function etopoHeightSource(): Promise<HeightSource> {
  const path = rawDataPath('etopo.surface30s');
  const { width, height } = await sharp(path, { limitInputPixels: false }).metadata();
  if (width === undefined || height === undefined || width !== 2 * height) {
    throw new Error(`etopoHeightSource: ${path} is ${width}x${height}, not a 2:1 equirect grid`);
  }
  return geoTiffHeightSource({
    id: 'etopo-2022-30s',
    attribution: ETOPO_PROVENANCE.attribution,
    provenance: ETOPO_PROVENANCE,
    grid: { path, width, height, bounds: WHOLE_GLOBE },
    nodata: ETOPO_NODATA,
    offsetM: 0,
    maxLevel: ETOPO_MAX_LEVEL,
  });
}
